# Delve Dodge Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a charge-based dodge to the Delve arena: a short dash with i-frames, and a perfect dodge (charge refund, riposte, slow-motion beat).

**Architecture:** The engine owns every rule. A new `arpg/dodge.ts` holds the dodge's start, movement, recharge and perfect detection; `step.ts` and `combat.ts` call into it where the hero moves, where monster attacks resolve, and where hits land. The client adds input (Space, a HUD button), VFX and a display-only slow motion.

**Tech Stack:** TypeScript, Vitest (engine and client), PixiJS 8, React 19, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-26-delve-dodge-design.md`

**Conventions:**
- Use TDD.
- Rebuild the engine (`pnpm -F @alloy/engine build`) before client work.
- Run `tests/delve-pacing.test.ts` after the bot change.
- Commit each task with the repo's trailer.

---

## Chunk 1: Engine

### Task 1: Data and types

**Files:**
- Modify: `engine/src/data/balance.json` (`delve.dodge`)
- Modify: `engine/src/data/schemas.ts` (`DelveBalanceSchema.dodge`, with the rule `perfectWindow ≤ iframes`)
- Modify: `engine/src/types/delve.ts` (`DelveBalance.dodge`)
- Modify: `engine/src/types/arpg.ts`:
  - `HeroEntity`: `dodgeCharges`, `dodgeRechargeAt`, `dodge`, `riposteUntil`;
  - `ArpgInput.dodge`;
  - `ArpgWorld.queuedDodge`;
  - events `dodge` and `perfectDodge`.
- Modify: `engine/src/arpg/world.ts` (initial values)

- [ ] Add `"dodge": { "charges": 2, "recharge": 2.5, "distance": 3, "duration": 0.2, "iframes": 0.25, "perfectWindow": 0.15, "riposteWindow": 1.5 }`, its schema and its type.
- [ ] Add the new fields:
  - `dodge: { dir: Vec; fromX: number; fromY: number; start: number; until: number; perfect: boolean } | null`;
  - events `{ kind: 'dodge'; fromX; fromY; dirX; dirY }` and `{ kind: 'perfectDodge'; x; y }`.
- [ ] Initial values: `dodgeCharges = bal.dodge.charges`, `dodgeRechargeAt = 0`, `dodge = null`, `riposteUntil = 0`, `queuedDodge = false`.
- [ ] Typecheck.

### Task 2: The dodge (`tests/delve-dodge.test.ts`, `arpg/dodge.ts`)

- [ ] Failing tests (use `tests/fixtures/arena.ts`; add `dodge` to its `press`-style helpers):
  - a dodge spends a charge and moves the hero about 3 units along the move direction over about 0.2 s;
  - standing still, it goes away from the nearest foe; with nothing near, it goes along the facing;
  - no dodge at zero charges, and none while already dashing (the second press is held until the dash ends);
  - charges refill one at a time every `recharge`;
  - i-frames block a hit (`hurtHero` changes no HP);
  - a dodge during a cast wind-up cancels it: mana spent, `cooldowns[slot] <= t`, `windup` null;
  - a cast pressed mid-dash fires when the dash ends;
  - a dodge tap between frames is not lost.
- [ ] Implement `tryDodge(ctx, move)` and `dodgeTick(ctx, dt)`.
- [ ] Wire them into `step.ts`:
  - `stepWorld` queues `input.dodge`;
  - `heroTick` order: the potion; then `dodgeTick` (dash movement and end); then a queued dodge (`tryDodge`, held while dashing); then a queued cast (held while dashing); then `castTick`. Skip movement and basic attacks while dashing.
  - `separate()` skips the hero while dashing.

### Task 3: Perfect dodge and riposte

- [ ] Failing tests:
  - a hit blocked by i-frames within 0.15 s is a PERFECT: a `perfectDodge` event, the charge back, `riposteUntil > t`. One after the window is not;
  - dodging away from a melee swing (so it misses) is a PERFECT, and so is leaving a boss slam circle;
  - a projectile that crosses the start point keeps flying;
  - a second PERFECT during an active riposte doesn't refund the charge;
  - the riposte makes the next real hit crit and stagger, then ends; a burn tick doesn't spend it.
- [ ] Implement in `dodge.ts`:
  - `perfectOrigin(ctx)` returns `{x, y}` while `t - dodge.start <= perfectWindow` and the PERFECT hasn't paid out;
  - `notePerfect(ctx)` checks the window itself, refunds the charge unless a riposte is active, arms the riposte and pushes the event.
- [ ] Call sites:
  - `hurtHero`'s i-frame branch calls `notePerfect`;
  - `step.ts` melee swing end, charger contact, slam detonation and projectile contact test the start point too, calling only `notePerfect`;
  - `hitMonster`: for a real hit (`source` basic or skill, and `opts.crit !== undefined || opts.canCrit`) during a riposte, force the crit, add `stagger` and set `riposteUntil = 0`.

### Task 4: Bot and pacing

- [ ] `bot.ts`: with a charge, dodge (the move direction is already away) when standing in a monster slam telegraph, or when a melee or charger foe within reach is 0.15 s or less from the end of its wind-up.
- [ ] Run the full engine suite, including `delve-pacing`. If a guard rail fails, tune only the bot's thresholds.
- [ ] Commit the engine.

## Chunk 2: Client

### Task 5: Input and HUD

- [ ] `input.ts`: Space sets `input.dodge = true` (preventDefault); F alone drinks the potion. Test (`__tests__/arena-input.test.ts`): Space → dodge, F → potion.
- [ ] `useArena.ts`:
  - pass `dodge` in `ArpgInput` and clear it after the step;
  - a `dodge()` callback;
  - the HUD snapshot gains `dodgeCharges`, `dodgeMax` and `dodgeRefill` (0..1);
  - on `perfectDodge`, slow motion: for 0.2 real seconds multiply both the `stepWorld` and the `renderer.update` dt by 0.3.
- [ ] `ArenaHud.tsx`: a dodge button 💨 (`data-testid="dodge-button"`) left of the potion, with charge pips, a refill arc, a `Space` hint and a pulse on a PERFECT.
- [ ] `DelveRun.tsx`: pass `onDodge`; play a sound on `perfectDodge`.

### Task 6: Renderer, labels, E2E, version

- [ ] `ArenaRenderer.ts`:
  - on `dodge`: a streak from the start point, and a trail while dashing;
  - on `perfectDodge`: a white hero flash, "PERFECT", a ring and a shake;
  - floating "DODGE" becomes "EVADE".
- [ ] `delve.json`: the `dodge` stat's label becomes "Evasion".
- [ ] E2E D01: `dodge-button` is visible.
- [ ] Update CLAUDE.md (Delve section) and bump the client to 0.34.0.
- [ ] Run all tests plus the Delve E2E on 4 devices; commit and push.
