# Bugfix & Test Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all confirmed engine bugs, data integrity issues, and client issues found in the March 2026 code review, then add regression tests for the untested core combat formulas and duel mechanics.

**Architecture:** TDD approach — write failing tests first, then fix the code. Each task is one logical fix with its tests. Engine fixes are pure functions with immutable state, so each fix is isolated. Data fixes are JSON edits validated by existing schema tests.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces. Run tests with `pnpm -F @alloy/engine test -- --run` and `pnpm -F @alloy/client test -- --run`.

**Key API signatures for test writing:**

```typescript
// simulate takes 5 args: stats tuple, loadouts tuple, registry, rng, round
simulate(stats: [DerivedStats, DerivedStats], loadouts: [Loadout, Loadout], registry: DataRegistry, rng: SeededRNG, round: number): CombatLog

// makeStats helper (already in duel.test.ts) — creates stats with maxHP: 200 default
function makeStats(overrides: Partial<DerivedStats> = {}): DerivedStats

// makeLoadouts helper (already in duel.test.ts) — takes NO arguments, returns empty sword/chainmail loadouts
function makeLoadouts(): [Loadout, Loadout]

// AIController.planAdapt signature:
planAdapt(previousLog: CombatLog, opponentLoadout: Loadout, myLoadout: Loadout, myStockpile: OrbInstance[], fluxRemaining: number): ForgeAction[]

// AdaptStrategy.adapt signature (in adapt-strategy.ts line 9):
adapt(previousDuelLog: CombatLog, opponentLoadout: Loadout, myLoadout: Loadout, myStockpile: OrbInstance[], fluxRemaining: number, registry: DataRegistry, rng: SeededRNG): ForgeAction[]

// createGladiator is in gladiator.ts, NOT duel-engine.ts
createGladiator(playerId: 0 | 1, stats: DerivedStats): GladiatorRuntime
```

---

## Chunk 1: Critical Engine Bug Fixes (duel-engine.ts)

### Task 1: Fix `on_low_hp` triggers never applied

The `updateLowHP` function (line 486) evaluates triggers and logs `trigger_proc` events, but never calls `applyTriggerEffect`. Compare with `fireTriggers()` at lines 378-399 which correctly calls `applyTriggerEffect` before logging.

**Files:**
- Modify: `packages/engine/src/duel/duel-engine.ts:486-512` (function definition)
- Modify: `packages/engine/src/duel/duel-engine.ts:280-281` (call sites)
- Test: `packages/engine/tests/duel.test.ts`

- [ ] **Step 1: Write a baseline test proving the code path doesn't crash**

Add to the `describe('Duel Engine')` block in `packages/engine/tests/duel.test.ts`:

```typescript
it('gladiator crossing low HP threshold does not error', () => {
  // Player 0 has low damage, player 1 has high damage — player 0 will cross 30% HP
  const stats0 = makeStats({ maxHP: 100, physicalDamage: 5, attackInterval: 30 });
  const stats1 = makeStats({ maxHP: 100, physicalDamage: 40, attackInterval: 30 });
  const loadouts = makeLoadouts();
  const rng = new SeededRNG(999);

  const log = simulate([stats0, stats1], loadouts, registry, rng, 1);

  // Player 1 should win (40 dmg vs 5 dmg)
  expect(log.result.winner).toBe(1);
  // Player 0 took enough damage to cross the 30% threshold (100 * 0.3 = 30 HP)
  expect(log.result.finalHP[0]).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 2: Run test to verify it passes (baseline — the bug is silent, not a crash)**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: PASS

- [ ] **Step 3: Apply the fix to updateLowHP — add opponent parameter and call applyTriggerEffect**

In `packages/engine/src/duel/duel-engine.ts`, replace the `updateLowHP` function (lines 486-512):

Replace:
```typescript
function updateLowHP(
  gladiator: GladiatorRuntime,
  triggerDefs: TriggerDef[],
  rng: SeededRNG,
  log: ReturnType<typeof createCombatLog>,
  tick: number,
): void {
  const isNowLow = gladiator.currentHP > 0 && gladiator.currentHP / gladiator.maxHP < 0.3;
  if (isNowLow && !gladiator.isLowHP) {
    gladiator.isLowHP = true;
    for (const trigger of triggerDefs) {
      const effect = evaluateTrigger(trigger, 'on_low_hp', gladiator, rng);
      if (effect) {
        // For on_low_hp, the "opponent" isn't readily available here,
        // but we apply to self (owner-focused effects)
        log.addEvent(tick, {
          type: 'trigger_proc',
          player: gladiator.playerId,
          triggerId: trigger.affixId,
          effectDescription: effect.kind,
        });
      }
    }
  } else if (!isNowLow) {
    gladiator.isLowHP = false;
  }
}
```

With:
```typescript
function updateLowHP(
  gladiator: GladiatorRuntime,
  opponent: GladiatorRuntime,
  triggerDefs: TriggerDef[],
  rng: SeededRNG,
  log: ReturnType<typeof createCombatLog>,
  tick: number,
): void {
  const isNowLow = gladiator.currentHP > 0 && gladiator.currentHP / gladiator.maxHP < 0.3;
  if (isNowLow && !gladiator.isLowHP) {
    gladiator.isLowHP = true;
    for (const trigger of triggerDefs) {
      const effect = evaluateTrigger(trigger, 'on_low_hp', gladiator, rng);
      if (effect) {
        applyTriggerEffect(effect, gladiator, opponent, log, tick);
        log.addEvent(tick, {
          type: 'trigger_proc',
          player: gladiator.playerId,
          triggerId: trigger.affixId,
          effectDescription: effect.kind,
        });
      }
    }
  } else if (!isNowLow) {
    gladiator.isLowHP = false;
  }
}
```

- [ ] **Step 4: Update the two call sites at lines 280-281**

Replace:
```typescript
        updateLowHP(attacker, triggers[attackerIdx], rng, log, tick);
        updateLowHP(defender, triggers[defenderIdx], rng, log, tick);
```

With:
```typescript
        updateLowHP(attacker, defender, triggers[attackerIdx], rng, log, tick);
        updateLowHP(defender, attacker, triggers[defenderIdx], rng, log, tick);
```

- [ ] **Step 5: Run tests to verify nothing broke**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/duel/duel-engine.ts packages/engine/tests/duel.test.ts
git commit -m "fix(engine): apply trigger effects in updateLowHP instead of just logging them"
```

---

### Task 2: Fix `stat_buff` triggers — buff values never consumed in combat

`activeBuffs` are pushed to by `applyTriggerEffect` and ticked down by `processBuffs()`, but no code reads the buff values during damage calculations. The fix: add a `getBuffedStat` helper and use it in attack resolution.

**Files:**
- Modify: `packages/engine/src/duel/duel-engine.ts`
- Test: `packages/engine/tests/duel.test.ts`

- [ ] **Step 1: Add getBuffedStat helper function**

In `packages/engine/src/duel/duel-engine.ts`, add after the `processBuffs` function (after line 373):

```typescript
/**
 * Get a stat value with active buff modifications applied.
 */
function getBuffedStat(gladiator: GladiatorRuntime, stat: keyof DerivedStats): number {
  let value = gladiator.stats[stat] as number;
  for (const buff of gladiator.activeBuffs) {
    if (buff.stat === stat) {
      value += buff.value;
    }
  }
  return value;
}
```

- [ ] **Step 2: Apply buffed stats to crit chance calculation**

At line 178, replace:
```typescript
        const effectiveCritChance = Math.max(0, attacker.stats.critChance - defender.stats.critAvoidance);
```

With:
```typescript
        const effectiveCritChance = Math.max(0, getBuffedStat(attacker, 'critChance') - getBuffedStat(defender, 'critAvoidance'));
```

- [ ] **Step 3: Apply buffed stats to lifesteal**

At line 246, replace:
```typescript
        if (attacker.stats.lifestealPercent > 0 && totalDamage > 0) {
          const healed = totalDamage * attacker.stats.lifestealPercent;
```

With:
```typescript
        const lifesteal = getBuffedStat(attacker, 'lifestealPercent');
        if (lifesteal > 0 && totalDamage > 0) {
          const healed = totalDamage * lifesteal;
```

Note: The lifesteal base variable (`totalDamage` vs `damageToHP`) fix is in Task 4. Apply this Task's changes first, then Task 4 will change `totalDamage` to `damageToHP`.

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: All tests PASS (no buffs are active in existing tests since triggers are stubbed)

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/duel/duel-engine.ts
git commit -m "fix(engine): consume activeBuffs values in combat via getBuffedStat helper"
```

---

### Task 3: Implement `reflect_damage` trigger effect

Currently a no-op at `duel-engine.ts:476-479`. The fix: when `reflect_damage` fires, set a timed reflect buff on the owner that reflects incoming damage.

**Files:**
- Modify: `packages/engine/src/types/combat.ts` (add fields to GladiatorRuntime)
- Modify: `packages/engine/src/duel/gladiator.ts` (initialize new fields)
- Modify: `packages/engine/src/duel/duel-engine.ts` (implement effect + tick-down)

- [ ] **Step 1: Add reflectMultiplier fields to GladiatorRuntime**

In `packages/engine/src/types/combat.ts`, add to the `GladiatorRuntime` interface (after `isLowHP` at line 31):

```typescript
  reflectMultiplier: number;     // Active reflect damage multiplier (0 = no reflect active)
  reflectTicksRemaining: number; // Ticks until reflect expires
```

- [ ] **Step 2: Initialize new fields in createGladiator**

In `packages/engine/src/duel/gladiator.ts`, add to the returned object (after `isLowHP: false` at line 22):

```typescript
    reflectMultiplier: 0,
    reflectTicksRemaining: 0,
```

- [ ] **Step 3: Implement the reflect_damage case in applyTriggerEffect**

In `packages/engine/src/duel/duel-engine.ts`, replace lines 476-479:

```typescript
    case 'reflect_damage': {
      // Reflect damage is handled as a buff; actual reflection is processed elsewhere
      break;
    }
```

With:
```typescript
    case 'reflect_damage': {
      owner.reflectMultiplier = effect.multiplier;
      owner.reflectTicksRemaining = effect.durationTicks;
      break;
    }
```

- [ ] **Step 4: Add reflect damage processing after thorns (around line 277)**

After the thorns block (after line 277 `}`), add:

```typescript
        // Reflect damage (from reflect_damage trigger)
        if (defender.reflectMultiplier > 0 && totalDamage > 0) {
          const reflected = Math.round(totalDamage * defender.reflectMultiplier);
          if (reflected > 0) {
            const oldHP = attacker.currentHP;
            attacker.currentHP = Math.max(0, attacker.currentHP - reflected);
            log.addEvent(tick, { type: 'thorns', reflector: defender.playerId, damage: reflected });
            log.addEvent(tick, {
              type: 'hp_change',
              player: attacker.playerId,
              oldHP,
              newHP: attacker.currentHP,
              maxHP: attacker.maxHP,
            });
          }
        }
```

- [ ] **Step 5: Add reflect tick-down at the top of the main tick loop**

In the main tick loop, after the DOT processing and before the attack order loop (around line 100), add:

```typescript
    // Tick down reflect buffs
    for (const g of gladiators) {
      if (g.reflectTicksRemaining > 0) {
        g.reflectTicksRemaining--;
        if (g.reflectTicksRemaining <= 0) {
          g.reflectMultiplier = 0;
        }
      }
    }
```

- [ ] **Step 6: Run tests to verify nothing broke**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/types/combat.ts packages/engine/src/duel/gladiator.ts packages/engine/src/duel/duel-engine.ts
git commit -m "fix(engine): implement reflect_damage trigger effect with timed reflect buff"
```

---

### Task 4: Fix lifesteal calculated on pre-barrier damage

Lifesteal at line 246 uses `totalDamage` (includes barrier-absorbed portion). Should use `damageToHP` — the actual HP damage dealt. Variable `damageToHP` is computed at line 210.

**Files:**
- Modify: `packages/engine/src/duel/duel-engine.ts:246-247`
- Test: `packages/engine/tests/duel.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/tests/duel.test.ts`:

```typescript
it('lifesteal is based on HP damage dealt, not barrier-absorbed damage', () => {
  const atkStats = makeStats({
    maxHP: 100,
    physicalDamage: 50,
    attackInterval: 30,
    lifestealPercent: 1.0, // 100% lifesteal for easy math
  });
  const defStats = makeStats({
    maxHP: 200,
    physicalDamage: 10,
    attackInterval: 60,
    barrierAmount: 1000, // Huge barrier absorbs all damage
  });
  const loadouts = makeLoadouts();
  const rng = new SeededRNG(42);

  const log = simulate([atkStats, defStats], loadouts, registry, rng, 1);

  // Find lifesteal events from player 0
  const lifestealEvents = log.ticks.flatMap(t =>
    t.events.filter((e): e is Extract<typeof e, { type: 'lifesteal' }> =>
      e.type === 'lifesteal' && e.player === 0
    )
  );
  // Find barrier absorb events
  const barrierAbsorbs = log.ticks.flatMap(t =>
    t.events.filter((e): e is Extract<typeof e, { type: 'barrier_absorb' }> =>
      e.type === 'barrier_absorb'
    )
  );

  // With a 1000 barrier, early hits should be fully absorbed
  expect(barrierAbsorbs.length).toBeGreaterThan(0);

  // While barrier is absorbing ALL damage, lifesteal healed should be 0
  // (no HP damage was actually dealt)
  // Check that we don't have inflated lifesteal from barrier-absorbed damage
  if (barrierAbsorbs.some(e => e.absorbed >= 50)) {
    // At least one hit was fully absorbed by barrier
    // If lifesteal was wrongly based on totalDamage, healed would be 50
    // If correctly based on damageToHP, healed would be 0 for that hit
    const maxLifesteal = Math.max(...lifestealEvents.map(e => e.healed), 0);
    // Post-fix: lifesteal should never exceed damageToHP (which is <= totalDamage - absorbed)
    // With 1000 barrier and 50 damage, damageToHP = 0 for all early hits
    expect(maxLifesteal).toBeLessThan(50);
  }
});
```

- [ ] **Step 2: Run test — should FAIL with current code (lifesteal based on totalDamage)**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: FAIL — lifesteal healed = 50 even when barrier absorbs everything

- [ ] **Step 3: Apply the fix**

In `packages/engine/src/duel/duel-engine.ts`, find the lifesteal block. After Task 2's changes, it reads:

```typescript
        const lifesteal = getBuffedStat(attacker, 'lifestealPercent');
        if (lifesteal > 0 && totalDamage > 0) {
          const healed = totalDamage * lifesteal;
```

Replace with:
```typescript
        const lifesteal = getBuffedStat(attacker, 'lifestealPercent');
        if (lifesteal > 0 && damageToHP > 0) {
          const healed = damageToHP * lifesteal;
```

If Task 2 hasn't been applied yet, the original code reads:
```typescript
        if (attacker.stats.lifestealPercent > 0 && totalDamage > 0) {
          const healed = totalDamage * attacker.stats.lifestealPercent;
```

Replace with:
```typescript
        if (attacker.stats.lifestealPercent > 0 && damageToHP > 0) {
          const healed = damageToHP * attacker.stats.lifestealPercent;
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/duel/duel-engine.ts packages/engine/tests/duel.test.ts
git commit -m "fix(engine): calculate lifesteal from HP damage dealt, not pre-barrier total"
```

---

## Chunk 2: AI and Data Integrity Fixes

### Task 5: Fix AI adapt strategy wrong player identification

All three tiers (3/4/5) use `previousDuelLog.result.winner === 0 ? 1 : 0` to infer the AI's player index. This is wrong when the AI won. The fix: add `myPlayerIdx` parameter to the `AdaptStrategy` interface and all implementations.

**Files:**
- Modify: `packages/engine/src/ai/strategies/adapt-strategy.ts` (interface + 5 classes)
- Modify: `packages/engine/src/ai/ai-controller.ts` (planAdapt signature)
- Test: `packages/engine/tests/ai.test.ts`

- [ ] **Step 1: Update the AdaptStrategy interface**

In `packages/engine/src/ai/strategies/adapt-strategy.ts`, change the interface (lines 9-18):

Replace:
```typescript
export interface AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: OrbInstance[],
    fluxRemaining: number,
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[];
}
```

With:
```typescript
export interface AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: OrbInstance[],
    fluxRemaining: number,
    myPlayerIdx: 0 | 1,
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[];
}
```

- [ ] **Step 2: Update all 5 tier class signatures to match**

For each `TierNAdaptStrategy` class (Tier1 through Tier5), update the `adapt` method signature to include `myPlayerIdx: 0 | 1` after `fluxRemaining`. The unused parameters in Tier1/Tier2 should be prefixed with `_`.

- [ ] **Step 3: Fix the player inference in Tier3/4/5**

In each of the three classes that contain:
```typescript
const myPlayerIdx = previousDuelLog.result.winner === 0 ? 1 : 0;
```

Delete that line. The `myPlayerIdx` parameter is now passed directly. Use it as-is. Compute `opponentIdx` from it:
```typescript
const opponentIdx = (myPlayerIdx === 0 ? 1 : 0) as 0 | 1;
```

This line already exists on the next line in each class — just remove the `myPlayerIdx` assignment.

- [ ] **Step 4: Update AIController.planAdapt**

In `packages/engine/src/ai/ai-controller.ts`, change `planAdapt` (lines 77-93):

Replace:
```typescript
  planAdapt(
    previousLog: CombatLog,
    opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: OrbInstance[],
    fluxRemaining: number,
  ): ForgeAction[] {
    return this.adaptStrategy.adapt(
      previousLog,
      opponentLoadout,
      myLoadout,
      myStockpile,
      fluxRemaining,
      this.registry,
      this.rng,
    );
  }
```

With:
```typescript
  planAdapt(
    previousLog: CombatLog,
    opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: OrbInstance[],
    fluxRemaining: number,
    myPlayerIdx: 0 | 1,
  ): ForgeAction[] {
    return this.adaptStrategy.adapt(
      previousLog,
      opponentLoadout,
      myLoadout,
      myStockpile,
      fluxRemaining,
      myPlayerIdx,
      this.registry,
      this.rng,
    );
  }
```

- [ ] **Step 5: Update all call sites of planAdapt**

Search for `planAdapt(` in the entire codebase and add the `myPlayerIdx` argument. Known call sites:
- `packages/engine/src/balance/simulation-runner.ts` (if it calls planAdapt)
- `packages/tools/src/hooks/useSimulation.ts` (if it calls planAdapt)
- Any client-side code that calls `aiController.planAdapt()`

Pass the correct player index at each call site.

- [ ] **Step 6: Write the test**

Add to `packages/engine/tests/ai.test.ts`:

```typescript
describe('adapt strategy player identification', () => {
  it('accepts myPlayerIdx parameter and does not error when AI is the winner', () => {
    const ai = new AIController(3, registry, new SeededRNG(42).fork('ai'));
    const emptyLoadout = createEmptyLoadout('sword', 'chainmail');

    const mockDuelLog: CombatLog = {
      seed: 42,
      ticks: [],
      result: {
        round: 1,
        winner: 0,
        finalHP: [50, 0],
        tickCount: 100,
        duration: 3.33,
        wasTiebreak: false,
      },
    };

    // AI is player 0 (the winner) — should analyze player 1's damage, not its own
    const actions = ai.planAdapt(mockDuelLog, emptyLoadout, emptyLoadout, [], 0, 0);
    expect(actions).toEqual([]);

    // AI is player 1 (the loser) — should analyze player 0's damage
    const actions2 = ai.planAdapt(mockDuelLog, emptyLoadout, emptyLoadout, [], 0, 1);
    expect(actions2).toEqual([]);
  });
});
```

Note: Import `createEmptyLoadout` from `'../src/types/item.js'` and `CombatLog` from `'../src/types/combat.js'` if not already imported.

- [ ] **Step 7: Run tests**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/ai/strategies/adapt-strategy.ts packages/engine/src/ai/ai-controller.ts packages/engine/tests/ai.test.ts
git commit -m "fix(engine): pass myPlayerIdx to adapt strategies instead of inferring from winner"
```

---

### Task 6: Fix invalid combination component IDs + add referential integrity test

`iron_maiden` references `block` (should be `block_chance`) and `riposte` references `dodge` (should be `dodge_chance`).

**Files:**
- Modify: `packages/engine/src/data/combinations.json`
- Modify: `packages/engine/tests/data.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the appropriate `describe` block in `packages/engine/tests/data.test.ts`:

```typescript
it('all combination component IDs reference valid affix IDs', () => {
  const affixIds = new Set(registry.getAllAffixes().map(a => a.id));
  const combinations = registry.getAllCombinations();
  for (const combo of combinations) {
    for (const componentId of combo.components) {
      expect(
        affixIds.has(componentId),
        `Combination "${combo.id}" references unknown affix "${componentId}"`
      ).toBe(true);
    }
  }
});

it('all synergy required affixes reference valid affix IDs', () => {
  const affixIds = new Set(registry.getAllAffixes().map(a => a.id));
  const synergies = registry.getAllSynergies();
  for (const syn of synergies) {
    for (const reqId of syn.requiredAffixes) {
      expect(
        affixIds.has(reqId),
        `Synergy "${syn.id}" references unknown affix "${reqId}"`
      ).toBe(true);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: FAIL — `iron_maiden` references `block`, `riposte` references `dodge`

- [ ] **Step 3: Fix the JSON data**

In `packages/engine/src/data/combinations.json`:

For `iron_maiden`, change:
```json
"components": ["thorns", "block"],
```
To:
```json
"components": ["thorns", "block_chance"],
```

For `riposte`, change:
```json
"components": ["dodge", "attack_speed"],
```
To:
```json
"components": ["dodge_chance", "attack_speed"],
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/data/combinations.json packages/engine/tests/data.test.ts
git commit -m "fix(data): correct invalid component IDs in iron_maiden and riposte combinations"
```

---

### Task 7: Fix loader.ts `as any` cast

`loader.ts:32` uses `(rawBaseItems as any).weapons` bypassing type safety.

**Files:**
- Modify: `packages/engine/src/data/loader.ts`

- [ ] **Step 1: Read the current loader.ts**

Read `packages/engine/src/data/loader.ts` to understand the full context around line 32.

- [ ] **Step 2: Add a typed interface and replace the cast**

Add near the top of `loader.ts`:
```typescript
interface RawBaseItemsJSON {
  weapons: unknown[];
  armors: unknown[];
}
```

Replace:
```typescript
const flatBaseItems = [...(rawBaseItems as any).weapons, ...(rawBaseItems as any).armors];
```

With:
```typescript
const raw = rawBaseItems as RawBaseItemsJSON;
const flatBaseItems = [...raw.weapons, ...raw.armors];
```

- [ ] **Step 3: Run tests**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/data/loader.ts
git commit -m "fix(engine): replace 'as any' cast in loader with typed interface"
```

---

### Task 8: Fix useDraftSync payload nesting

The Supabase Realtime broadcast `.on('broadcast', ...)` callback receives `{ event, type, payload }` where `payload` contains the user's data. The current code accesses properties directly on the callback argument.

**Files:**
- Modify: `packages/client/src/features/draft/hooks/useDraftSync.ts`

- [ ] **Step 1: Check the Supabase Realtime client version in package.json**

Read `packages/client/package.json` to check the `@supabase/supabase-js` version. If v2.x+, the broadcast callback receives `{ event, payload }` where `payload` IS the user's data — meaning the current code accessing `payload.orbUid` may actually be CORRECT depending on how the mock broadcasts.

**IMPORTANT:** Only apply this fix after verifying the payload structure. If using a `MockSupabaseClient`, check what shape it broadcasts. If the nesting is already correct for the mock client, do NOT change it — instead add a `// TODO: verify payload shape with real Supabase client` comment.

- [ ] **Step 2: Read the MockSupabaseClient implementation**

Read `packages/client/src/shared/utils/supabase.ts` to understand the mock's broadcast behavior.

- [ ] **Step 3: Apply fix only if confirmed wrong**

If the mock broadcasts `{ orbUid, pickOrder }` directly as the payload arg, the current code is correct for the mock. In that case:

Add a comment on each handler:
```typescript
// Note: With real Supabase Realtime v2+, broadcast payload is { event, payload: userData }
// The mock client passes data directly. Update when switching to real client.
```

If the mock wraps data under `payload.payload`, then change:
```typescript
onOpponentPick(payload.orbUid, payload.pickOrder);
```
To:
```typescript
onOpponentPick(payload.payload.orbUid, payload.payload.pickOrder);
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/draft/hooks/useDraftSync.ts
git commit -m "fix(client): document Supabase broadcast payload shape for draft sync handlers"
```

---

## Chunk 3: Dead Code and Duplication Cleanup

### Task 9: Remove dead duelStore

**Files:**
- Delete: `packages/client/src/stores/duelStore.ts`

- [ ] **Step 1: Verify duelStore is not imported anywhere**

Search for imports of `duelStore` across the entire client package. Check both `import` statements and dynamic references.

- [ ] **Step 2: Delete the file (only if truly unused)**

```bash
rm packages/client/src/stores/duelStore.ts
```

- [ ] **Step 3: Run client tests**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/client test -- --run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add -A packages/client/src/stores/duelStore.ts
git commit -m "chore(client): remove unused duelStore (Duel.tsx uses local state)"
```

---

### Task 10: Deduplicate isSynergyActive and collectAffixIds

Both `isSynergyActive()` and `collectAffixIds()` are duplicated between `stat-calculator.ts` and `simulation-runner.ts`.

**Files:**
- Modify: `packages/engine/src/forge/stat-calculator.ts`
- Modify: `packages/engine/src/balance/simulation-runner.ts`

- [ ] **Step 1: Export isSynergyActive and collectAffixIds from stat-calculator.ts**

Add `export` keyword to both function declarations if they're not already exported.

- [ ] **Step 2: Import and use in simulation-runner.ts**

In `packages/engine/src/balance/simulation-runner.ts`, replace the local definitions with:
```typescript
import { isSynergyActive, collectAffixIds } from '../forge/stat-calculator.js';
```

Delete the local copies of both functions.

- [ ] **Step 3: Run tests**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/forge/stat-calculator.ts packages/engine/src/balance/simulation-runner.ts
git commit -m "refactor(engine): deduplicate isSynergyActive and collectAffixIds"
```

---

## Chunk 4: Core Combat Test Coverage (damage-calc.ts)

### Task 11: Add damage-calc.ts unit tests

The core damage formulas have zero direct tests. This is the highest-priority test gap.

**Files:**
- Create: `packages/engine/tests/damage-calc.test.ts`

- [ ] **Step 1: Create the test file with all tests**

Create `packages/engine/tests/damage-calc.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculatePhysicalDamage, calculateElementalDamage, calculateDOTDamage } from '../src/duel/damage-calc.js';
import { createEmptyDerivedStats } from '../src/types/derived-stats.js';
import type { DerivedStats } from '../src/types/derived-stats.js';
import type { ActiveDOT } from '../src/types/combat.js';

function makeStats(overrides: Partial<DerivedStats> = {}): DerivedStats {
  return { ...createEmptyDerivedStats(), ...overrides };
}

describe('calculatePhysicalDamage', () => {
  it('deals full damage with 0% armor', () => {
    const attacker = makeStats({ physicalDamage: 100 });
    const defender = makeStats({ armor: 0 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(100);
  });

  it('reduces damage by 50% with 50% armor and 0% penetration', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 0 });
    const defender = makeStats({ armor: 0.5 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(50);
  });

  it('armor penetration bypasses armor', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 0.5 });
    const defender = makeStats({ armor: 0.5 });
    // effective armor = 0.5 * (1 - 0.5) = 0.25, damage = 100 * (1 - 0.25) = 75
    expect(calculatePhysicalDamage(attacker, defender)).toBe(75);
  });

  it('100% armor with 0% penetration deals zero damage', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 0 });
    const defender = makeStats({ armor: 1.0 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(0);
  });

  it('100% armor with 100% penetration deals full damage', () => {
    const attacker = makeStats({ physicalDamage: 100, armorPenetration: 1.0 });
    const defender = makeStats({ armor: 1.0 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(100);
  });

  it('never returns negative damage', () => {
    const attacker = makeStats({ physicalDamage: 0 });
    const defender = makeStats({ armor: 1.0 });
    expect(calculatePhysicalDamage(attacker, defender)).toBeGreaterThanOrEqual(0);
  });

  it('zero physical damage returns zero', () => {
    const attacker = makeStats({ physicalDamage: 0 });
    const defender = makeStats({ armor: 0 });
    expect(calculatePhysicalDamage(attacker, defender)).toBe(0);
  });
});

describe('calculateElementalDamage', () => {
  it('deals full elemental damage with 0% resistance', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats();
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(100);
  });

  it('reduces damage by resistance', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats({
      resistances: { fire: 0.5, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(50);
  });

  it('elemental penetration bypasses resistance', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
      elementalPenetration: 0.5,
    });
    const defender = makeStats({
      resistances: { fire: 0.8, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    // effectiveResist = 0.8 * (1 - 0.5) = 0.4, damage = 100 * (1 - 0.4) = 60
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(60);
  });

  it('returns 0 for elements with no damage', () => {
    const attacker = makeStats();
    const defender = makeStats();
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(0);
  });

  it('90% resistance with 0% penetration leaves 10% damage', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats({
      resistances: { fire: 0.9, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBeCloseTo(10);
  });

  it('each element is independent', () => {
    const attacker = makeStats({
      elementalDamage: { fire: 100, cold: 50, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const defender = makeStats({
      resistances: { fire: 0.5, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    expect(calculateElementalDamage(attacker, defender, 'fire')).toBe(50);
    expect(calculateElementalDamage(attacker, defender, 'cold')).toBe(50);
  });
});

describe('calculateDOTDamage', () => {
  it('deals base DOT damage with no resistance', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats();
    const attacker = makeStats({ dotMultiplier: 1 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(10);
  });

  it('stacks multiply DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 3,
    };
    const defender = makeStats();
    const attacker = makeStats({ dotMultiplier: 1 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(30);
  });

  it('resistance reduces DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 100, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats({
      resistances: { fire: 0.5, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const attacker = makeStats({ dotMultiplier: 1, elementalPenetration: 0 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(50);
  });

  it('dotMultiplier scales DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats();
    const attacker = makeStats({ dotMultiplier: 2.0 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(20);
  });

  it('full resistance results in zero DOT damage', () => {
    const dot: ActiveDOT = {
      element: 'poison', damagePerTick: 50, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats({
      resistances: { fire: 0, cold: 0, lightning: 0, poison: 1.0, shadow: 0, chaos: 0 },
    });
    const attacker = makeStats({ dotMultiplier: 1, elementalPenetration: 0 });
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(0);
  });

  it('elemental penetration bypasses DOT resistance', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 100, remainingTicks: 30, sourceAffixId: 'test', stacks: 1,
    };
    const defender = makeStats({
      resistances: { fire: 0.8, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const attacker = makeStats({ dotMultiplier: 1, elementalPenetration: 0.5 });
    // effectiveResist = 0.8 * (1 - 0.5) = 0.4, damage = 100 * (1 - 0.4) * 1 = 60
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(60);
  });

  it('combined stacks, resistance, penetration, and multiplier', () => {
    const dot: ActiveDOT = {
      element: 'fire', damagePerTick: 10, remainingTicks: 30, sourceAffixId: 'test', stacks: 2,
    };
    const defender = makeStats({
      resistances: { fire: 0.5, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
    });
    const attacker = makeStats({ dotMultiplier: 1.5, elementalPenetration: 0.5 });
    // rawDamage = 10 * 2 = 20
    // effectiveResist = 0.5 * (1 - 0.5) = 0.25
    // result = 20 * (1 - 0.25) * 1.5 = 20 * 0.75 * 1.5 = 22.5
    expect(calculateDOTDamage(dot, defender, attacker)).toBe(22.5);
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/damage-calc.test.ts
git commit -m "test(engine): add comprehensive unit tests for damage-calc.ts (physical, elemental, DOT)"
```

---

## Chunk 5: Duel Mechanic Regression Tests

### Task 12: Add simultaneous death tiebreaker tests

**Files:**
- Modify: `packages/engine/tests/duel.test.ts`

- [ ] **Step 1: Add simultaneous death tests**

Add to the `describe('Duel Engine')` block:

```typescript
it('simultaneous death via thorns resolves to a winner', () => {
  // Both gladiators with massive thorns and damage — likely to die same tick
  const stats0 = makeStats({
    maxHP: 50,
    physicalDamage: 100,
    attackInterval: 30,
    thornsDamage: 100,
  });
  const stats1 = makeStats({
    maxHP: 50,
    physicalDamage: 100,
    attackInterval: 30,
    thornsDamage: 100,
  });
  const loadouts = makeLoadouts();
  const rng = new SeededRNG(42);

  const log = simulate([stats0, stats1], loadouts, registry, rng, 1);

  // Must have a winner (0 or 1), never undefined
  expect([0, 1]).toContain(log.result.winner);
  // Should have death events
  const deaths = log.ticks.flatMap(t => t.events.filter(e => e.type === 'death'));
  expect(deaths.length).toBeGreaterThanOrEqual(1);
});

it('simultaneous death always produces a valid winner across many seeds', () => {
  for (let seed = 0; seed < 20; seed++) {
    const stats0 = makeStats({
      maxHP: 50,
      physicalDamage: 200,
      attackInterval: 30,
      thornsDamage: 200,
    });
    const stats1 = makeStats({
      maxHP: 50,
      physicalDamage: 200,
      attackInterval: 30,
      thornsDamage: 200,
    });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(seed);
    const log = simulate([stats0, stats1], loadouts, registry, rng, 1);
    expect([0, 1]).toContain(log.result.winner);
  }
});
```

- [ ] **Step 2: Run tests**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/duel.test.ts
git commit -m "test(engine): add simultaneous death tiebreaker regression tests"
```

---

### Task 13: Add phase machine adapt transition tests

**Files:**
- Modify: `packages/engine/tests/match.test.ts`

- [ ] **Step 1: Read the MatchPhase type to confirm exact shape**

Read `packages/engine/src/types/match.ts` to confirm the adapt phase type structure.

- [ ] **Step 2: Add adapt phase transition tests**

Add to the phase machine `describe` block in `packages/engine/tests/match.test.ts`:

```typescript
describe('adapt phase transitions', () => {
  it('adapt → duel is a valid transition (same round)', () => {
    expect(isValidTransition(
      { kind: 'adapt', round: 2 },
      { kind: 'duel', round: 2 },
    )).toBe(true);
  });

  it('adapt → forge is NOT a valid transition', () => {
    expect(isValidTransition(
      { kind: 'adapt', round: 2 },
      { kind: 'forge', round: 2 },
    )).toBe(false);
  });

  it('getNextPhase returns duel for adapt phase', () => {
    const next = getNextPhase({ kind: 'adapt', round: 2 }, []);
    expect(next.kind).toBe('duel');
  });

  it('getNextPhaseQuick returns duel for adapt phase', () => {
    const next = getNextPhaseQuick({ kind: 'adapt', round: 1 }, []);
    expect(next.kind).toBe('duel');
  });
});
```

Note: Verify that `isValidTransition`, `getNextPhase`, and `getNextPhaseQuick` are already imported in the test file. If not, add imports from `'../src/match/phase-machine.js'`.

- [ ] **Step 3: Run tests**

Run: `cd /c/Projects/Alloy && pnpm -F @alloy/engine test -- --run`
Expected: PASS (phase machine already handles adapt, just untested)

- [ ] **Step 4: Commit**

```bash
git add packages/engine/tests/match.test.ts
git commit -m "test(engine): add adapt phase transition tests for phase machine"
```

---

## Execution Order

Tasks can be parallelized in groups:

**Group A (independent engine fixes — different sections of duel-engine.ts):** Tasks 1, 3
**Group B (depends on nothing):** Tasks 5, 6, 7
**Group C (depends on Task 2 being reviewed for Task 4's lifesteal line):** Tasks 2 → 4
**Group D (independent cleanup):** Tasks 8, 9, 10
**Group E (test-only, no code changes, can run in parallel):** Tasks 11, 12, 13

Recommended serial order if not parallelizing:
1. Task 6 (data fix — safest, JSON only)
2. Task 7 (loader fix — trivial)
3. Task 11 (damage-calc tests — adds coverage before changing code)
4. Task 1 (on_low_hp fix)
5. Task 2 (stat_buff fix)
6. Task 4 (lifesteal fix — touches same area as Task 2)
7. Task 3 (reflect_damage — new feature implementation)
8. Task 5 (AI adapt fix)
9. Task 8 (client payload — needs investigation)
10. Task 9 (dead code removal)
11. Task 10 (deduplication)
12. Task 12 (simultaneous death tests)
13. Task 13 (adapt phase tests)
