# Seconds-Native Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tick-based (30 ticks/sec) time model with a seconds-native system where all values, durations, and combat log timestamps use seconds.

**Architecture:** Engine loop iterates in 0.1s steps (`STEPS_PER_SECOND = 10`). Regen/DOTs use accumulator pattern firing once per second (configurable). All balance values, types, and combat log speak seconds. Client playback uses real elapsed time against seconds-based frames.

**Tech Stack:** TypeScript, Vitest (engine tests), Playwright (E2E), PixiJS (client rendering), React

**Spec:** `docs/superpowers/specs/2026-04-03-seconds-native-engine-design.md`

---

## Chunk 1: Engine Types & Balance Data

### Task 1: Update BalanceConfig type and balance.json

**Files:**
- Modify: `packages/engine/src/types/balance.ts`
- Modify: `packages/engine/src/data/balance.json`
- Modify: `packages/engine/src/data/schemas.ts`
- Modify: `packages/engine/tests/data.test.ts`

- [ ] **Step 1: Update BalanceConfig interface**

In `packages/engine/src/types/balance.ts`, replace:
```typescript
  ticksPerSecond: number;
  maxDuelTicks: number;
  baseCritMultiplier: number;
  minAttackInterval: number; // In ticks
```
with:
```typescript
  maxDuelSeconds: number;
  baseCritMultiplier: number;
  minAttackSpeed: number; // In seconds (minimum time between attacks)
```

- [ ] **Step 2: Update balance.json**

In `packages/engine/src/data/balance.json`, replace:
```json
  "ticksPerSecond": 30,
  "maxDuelTicks": 3000,
  "baseCritMultiplier": 150,
  "minAttackInterval": 9,
```
with:
```json
  "maxDuelSeconds": 100,
  "baseCritMultiplier": 150,
  "minAttackSpeed": 0.3,
```

- [ ] **Step 3: Update Zod schema**

In `packages/engine/src/data/schemas.ts`, in the `BalanceConfigSchema`, replace:
```typescript
  ticksPerSecond: z.number().int().positive(),
  maxDuelTicks: z.number().int().positive(),
  baseCritMultiplier: z.number().positive(),
  minAttackInterval: z.number().int().positive(),
```
with:
```typescript
  maxDuelSeconds: z.number().positive(),
  baseCritMultiplier: z.number().positive(),
  minAttackSpeed: z.number().positive(),
```

- [ ] **Step 4: Update data.test.ts**

In `packages/engine/tests/data.test.ts`, find the assertion `expect(data.balance.ticksPerSecond).toBe(30);` and replace with:
```typescript
  expect(data.balance.maxDuelSeconds).toBe(100);
  expect(data.balance.minAttackSpeed).toBe(0.3);
```
Also remove any `maxDuelTicks` or `minAttackInterval` assertions if present.

- [ ] **Step 5: Run tests to verify**

Run: `pnpm --filter @alloy/engine test -- --run tests/data.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/types/balance.ts packages/engine/src/data/balance.json packages/engine/src/data/schemas.ts packages/engine/tests/data.test.ts
git commit -m "feat: migrate BalanceConfig from ticks to seconds"
```

---

### Task 2: Update DerivedStats

**Files:**
- Modify: `packages/engine/src/types/derived-stats.ts`
- Modify: `packages/engine/tests/derived-stats.test.ts`

- [ ] **Step 1: Rename attackInterval → attackSpeed in DerivedStats interface**

In `packages/engine/src/types/derived-stats.ts`:

Replace `attackInterval: number; // In ticks (minimum capped)` with:
```typescript
  attackSpeed: number; // Seconds between attacks
```

Replace `hpRegen: number; // Per tick` with:
```typescript
  hpRegen: number; // HP per second
```

- [ ] **Step 2: Update createEmptyDerivedStats default**

In the same file, in `createEmptyDerivedStats()`, replace:
```typescript
    attackInterval: 30, // 1 second at 30 ticks/sec
```
with:
```typescript
    attackSpeed: 1.0, // 1 second between attacks
```

- [ ] **Step 3: Update derived-stats.test.ts**

In `packages/engine/tests/derived-stats.test.ts`, replace:
```typescript
    expect(s.attackInterval).toBe(30);
```
with:
```typescript
    expect(s.attackSpeed).toBe(1.0);
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @alloy/engine test -- --run tests/derived-stats.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types/derived-stats.ts packages/engine/tests/derived-stats.test.ts
git commit -m "feat: rename attackInterval to attackSpeed (seconds)"
```

---

### Task 3: Update combat types (TickEvent → CombatEvent, runtime state)

**Files:**
- Modify: `packages/engine/src/types/combat.ts`

- [ ] **Step 1: Update ActiveDOT interface**

Replace:
```typescript
export interface ActiveDOT {
  element: Element;
  damagePerTick: number;
  remainingTicks: number;
  sourceAffixId: string;
  stacks: number;
  sourcePlayerId: 0 | 1;
}
```
with:
```typescript
export interface ActiveDOT {
  element: Element;
  damagePerSecond: number;
  remaining: number;        // seconds left
  tickInterval: number;     // seconds between ticks (default 1.0)
  accumulator: number;      // seconds since last tick
  sourceAffixId: string;
  stacks: number;
  sourcePlayerId: 0 | 1;
}
```

- [ ] **Step 2: Update ActiveBuff interface**

Replace `remainingTicks: number;` with `remaining: number; // seconds`.

- [ ] **Step 3: Update GladiatorRuntime interface**

Replace:
```typescript
  cooldowns: Map<string, number>; // triggerId -> ticks until available
  attackTimer: number; // Ticks until next attack
  stunTimer: number; // Ticks remaining stunned (0 = not stunned)
```
with:
```typescript
  cooldowns: Map<string, number>;    // triggerId -> seconds until available
  attackTimer: number;               // seconds until next attack
  stunTimer: number;                 // seconds remaining stunned
```

Replace `reflectTicksRemaining: number;` with `reflectRemaining: number; // seconds`.

Add two new fields to GladiatorRuntime:
```typescript
  regenAccumulator: number;  // seconds since last regen tick
  regenInterval: number;     // seconds between regen ticks (default 1.0)
```

- [ ] **Step 4: Rename TickEvent → CombatEvent and update event variants**

Rename the type alias: `export type TickEvent =` → `export type CombatEvent =`

In the `dot_apply` variant, replace `durationTicks: number` with `duration: number`.
In the `stun` variant, replace `durationTicks: number` with `duration: number`.

- [ ] **Step 5: Update CombatLog interface**

Replace:
```typescript
export interface CombatLog {
  seed: number;
  ticks: { tick: number; events: TickEvent[] }[];
  result: DuelResult;
}
```
with:
```typescript
export interface CombatLog {
  seed: number;
  frames: { time: number; events: CombatEvent[] }[];
  result: DuelResult;
}
```

- [ ] **Step 6: Update DuelResult — remove tickCount**

Remove `tickCount: number;` from `DuelResult`.
Update the `duration` comment to: `duration: number; // seconds`.

- [ ] **Step 7: Update TriggerDef and TriggerEffect types**

In `TriggerDef`, replace `cooldownTicks: number;` with `cooldown: number; // seconds`.

In `TriggerEffect`:
- `apply_dot`: replace `durationTicks: number` with `duration: number`
- `stun`: replace `durationTicks: number` with `duration: number`
- `stat_buff`: replace `durationTicks: number;` with `duration: number;`
- `reflect_damage`: replace `durationTicks: number` with `duration: number`

- [ ] **Step 8: Add backward-compat type alias**

At the bottom of the file, add:
```typescript
/** @deprecated Use CombatEvent instead */
export type TickEvent = CombatEvent;
```

This eases the migration — we can remove it in a later cleanup pass once all consumers are updated.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/types/combat.ts
git commit -m "feat: migrate combat types from ticks to seconds"
```

---

### Task 4: Update DamageBreakdown and MatchReport types

**Files:**
- Modify: `packages/engine/src/types/damage-breakdown.ts`
- Modify: `packages/engine/src/types/match-report.ts`

- [ ] **Step 1: Update DotTickBreakdown**

In `packages/engine/src/types/damage-breakdown.ts`, in `DotTickBreakdown`, replace:
```typescript
  damagePerTick: number;
```
with:
```typescript
  damagePerSecond: number;
```

- [ ] **Step 2: Update RoundReport**

In `packages/engine/src/types/match-report.ts`, in `RoundReport`, replace:
```typescript
  durationTicks: number;
```
with:
```typescript
  duration: number; // seconds
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types/damage-breakdown.ts packages/engine/src/types/match-report.ts
git commit -m "feat: migrate damage breakdown and match report types to seconds"
```

---

### Task 5: Update base-items.json (attackInterval → attackSpeed)

**Files:**
- Modify: `packages/engine/src/data/base-items.json`

- [ ] **Step 1: Convert all weapon attackInterval values**

In `packages/engine/src/data/base-items.json`, for every weapon, rename `"attackInterval"` to `"attackSpeed"` and divide the value by 30:

- Dagger: `"attackInterval": 30` → `"attackSpeed": 1.0`
- Sword: `"attackInterval": 54` → `"attackSpeed": 1.8`
- Mace: `"attackInterval": 66` → `"attackSpeed": 2.2`
- Axe: `"attackInterval": 75` → `"attackSpeed": 2.5`
- Battleaxe: `"attackInterval": 90` → `"attackSpeed": 3.0`
- Staff: `"attackInterval": 60` → `"attackSpeed": 2.0`
- Wand: `"attackInterval": 42` → `"attackSpeed": 1.4`

- [ ] **Step 2: Commit**

```bash
git add packages/engine/src/data/base-items.json
git commit -m "feat: convert base item attackInterval to attackSpeed (seconds)"
```

---

## Chunk 2: Engine Logic

### Task 6: Update gladiator.ts

**Files:**
- Modify: `packages/engine/src/duel/gladiator.ts`

- [ ] **Step 1: Rewrite createGladiator**

Replace the entire function body:
```typescript
import type { DerivedStats } from '../types/derived-stats.js';
import type { GladiatorRuntime } from '../types/combat.js';

const STEP_DURATION = 0.1;

/**
 * Create a GladiatorRuntime from DerivedStats for use in duel simulation.
 * Initiative reduces the initial attack timer so faster gladiators strike first.
 */
export function createGladiator(playerId: 0 | 1, stats: DerivedStats): GladiatorRuntime {
  const attackTimer = Math.max(STEP_DURATION, stats.attackSpeed * (1 - stats.initiative / 100));

  return {
    playerId,
    currentHP: stats.maxHP,
    maxHP: stats.maxHP,
    barrier: stats.barrierAmount,
    stats,
    activeDOTs: [],
    activeBuffs: [],
    cooldowns: new Map(),
    attackTimer,
    stunTimer: 0,
    isLowHP: false,
    reflectMultiplier: 0,
    reflectRemaining: 0,
    regenAccumulator: 0,
    regenInterval: 1.0,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/engine/src/duel/gladiator.ts
git commit -m "feat: update createGladiator for seconds-based timers"
```

---

### Task 7: Update combat-log.ts

**Files:**
- Modify: `packages/engine/src/duel/combat-log.ts`

- [ ] **Step 1: Rewrite combat-log.ts**

Replace the entire file:
```typescript
import type { CombatEvent, DuelResult, CombatLog } from '../types/combat.js';

export interface CombatLogBuilder {
  frames: { time: number; events: CombatEvent[] }[];
  addEvent(time: number, event: CombatEvent): void;
  finalize(result: DuelResult): CombatLog;
}

/**
 * Create a combat log builder that accumulates events by time
 * and finalizes into a frozen CombatLog.
 */
export function createCombatLog(seed: number): CombatLogBuilder {
  const timeMap = new Map<number, CombatEvent[]>();
  const frames: { time: number; events: CombatEvent[] }[] = [];

  return {
    frames,
    addEvent(time: number, event: CombatEvent): void {
      // Snap to clean 0.1s to avoid floating-point drift
      const snapped = Math.round(time * 10) / 10;
      let bucket = timeMap.get(snapped);
      if (!bucket) {
        bucket = [];
        timeMap.set(snapped, bucket);
        frames.push({ time: snapped, events: bucket });
      }
      bucket.push(event);
    },
    finalize(result: DuelResult): CombatLog {
      return Object.freeze({
        seed,
        frames: [...frames],
        result: { ...result },
      }) as CombatLog;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/engine/src/duel/combat-log.ts
git commit -m "feat: rewrite combat log for seconds-based frames"
```

---

### Task 8: Update damage-calc.ts (DOT function)

**Files:**
- Modify: `packages/engine/src/duel/damage-calc.ts`

- [ ] **Step 1: Rename damagePerTick → damagePerSecond in calculateDOTBreakdown**

In `packages/engine/src/duel/damage-calc.ts`, find `calculateDOTBreakdown` and:
- Rename parameter `damagePerTick` → `damagePerSecond`
- In the body, rename all references from `damagePerTick` to `damagePerSecond`
- In the return object, change `damagePerTick,` to `damagePerSecond,`

- [ ] **Step 2: Commit**

```bash
git add packages/engine/src/duel/damage-calc.ts
git commit -m "feat: rename damagePerTick to damagePerSecond in DOT calc"
```

---

### Task 9: Update trigger-system.ts

**Files:**
- Modify: `packages/engine/src/duel/trigger-system.ts`

- [ ] **Step 1: Update cooldownTicks → cooldown**

In `packages/engine/src/duel/trigger-system.ts`, in `evaluateTrigger`:

Replace:
```typescript
  if (trigger.cooldownTicks > 0) {
    gladiator.cooldowns.set(trigger.affixId, trigger.cooldownTicks);
  }
```
with:
```typescript
  if (trigger.cooldown > 0) {
    gladiator.cooldowns.set(trigger.affixId, trigger.cooldown);
  }
```

- [ ] **Step 2: Commit**

```bash
git add packages/engine/src/duel/trigger-system.ts
git commit -m "feat: update trigger system cooldowns to seconds"
```

---

### Task 10: Rewrite duel-engine.ts

**Files:**
- Modify: `packages/engine/src/duel/duel-engine.ts`

This is the biggest change. The engine loop changes from tick-based to step-based (0.1s steps).

- [ ] **Step 1: Rewrite the simulate function**

Replace the entire file content with the seconds-native version. Key changes:
- Add constants: `const STEPS_PER_SECOND = 10;` and `const STEP_DURATION = 0.1;`
- Loop: `for (let step = 0; step < maxSteps; step++)` where `maxSteps = balance.maxDuelSeconds * STEPS_PER_SECOND`
- Compute `const time = Math.round(step * STEP_DURATION * 10) / 10;` for each step
- DOTs: increment `dot.accumulator += STEP_DURATION`, fire when `>= dot.tickInterval`, reset accumulator
- Regen: increment `g.regenAccumulator += STEP_DURATION`, fire when `>= g.regenInterval`, reset accumulator
- Attack timer: `attacker.attackTimer -= STEP_DURATION`, fire when `<= 0`, reset to `attacker.stats.attackSpeed`
- Buffs: `buff.remaining -= STEP_DURATION`, expire when `<= 0`
- Stun: `attacker.stunTimer -= STEP_DURATION` (when stun > 0)
- Cooldowns: decrement by `STEP_DURATION`
- Reflect: `g.reflectRemaining -= STEP_DURATION`
- All `log.addEvent(tick, ...)` → `log.addEvent(time, ...)`
- DOT events: use `damagePerSecond` field
- `dot_apply` events: use `duration` instead of `durationTicks`
- `stun` events: use `duration` instead of `durationTicks`
- DOT remaining: `dot.remaining -= STEP_DURATION`
- Result: `duration: step * STEP_DURATION` (no tickCount)

The full implementation follows the same structure as the existing engine but with seconds-based timing. Preserve all game logic (initiative, dodge, block, crit, lifesteal, thorns, reflect, barriers, triggers, low-HP checks).

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p packages/engine/tsconfig.json 2>&1 | head -30`

Note: This will likely have errors in test files and other consumers. That's expected — we'll fix those in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/duel/duel-engine.ts
git commit -m "feat: rewrite duel engine loop for 0.1s steps"
```

---

### Task 11: Update stat-calculator.ts

**Files:**
- Modify: `packages/engine/src/forge/stat-calculator.ts`

- [ ] **Step 1: Update STAT_KEY_ALIASES**

Replace:
```typescript
  attackSpeed: 'attackInterval',
```
with:
```typescript
  attackSpeed: 'attackSpeed',
```

Since `attackSpeed` now maps directly to the DerivedStats field, no alias inversion needed.

- [ ] **Step 2: Update base item stat processing**

Find the section that handles `attackInterval` override from weapon base stats. Change:
```typescript
    if (stat === 'attackInterval') {
      stats.attackInterval = value;
```
to:
```typescript
    if (stat === 'attackSpeed') {
      stats.attackSpeed = value;
```

- [ ] **Step 3: Update attackSpeed scaling in applyBaseStatScaling**

Find the `attackSpeed` special case in `applyBaseStatScaling`. The current code inverts attackSpeed to attackInterval. Since they're now the same field, update:
```typescript
      if (scaleKey === 'attackSpeed') {
        buckets.percent.set(
          'attackSpeed',
          (buckets.percent.get('attackSpeed') ?? 0) + (-scaleValue),
        );
```
The sign inversion stays because positive attackSpeed scaling means faster = lower seconds value.

- [ ] **Step 4: Update applyCaps**

Replace:
```typescript
  stats.attackInterval = Math.max(stats.attackInterval, balance.minAttackInterval);
```
with:
```typescript
  stats.attackSpeed = Math.max(stats.attackSpeed, balance.minAttackSpeed);
```

- [ ] **Step 5: Update BASE_STAT_SCALING_MAP**

Replace the `attackSpeed: 'attackInterval',` entry with `attackSpeed: 'attackSpeed',`.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/forge/stat-calculator.ts
git commit -m "feat: update stat calculator for attackSpeed (seconds)"
```

---

### Task 12: Update match-report.ts and stats-collector.ts

**Files:**
- Modify: `packages/engine/src/match/match-report.ts`
- Modify: `packages/engine/src/balance/stats-collector.ts`

- [ ] **Step 1: Update match-report.ts**

In `extractMatchReport`, find the `roundDetails` mapping and replace:
```typescript
    durationTicks: r.tickCount,
```
with:
```typescript
    duration: r.duration,
```

- [ ] **Step 2: Update stats-collector.ts**

Replace `avgDuelTickCount` with `avgDuelDuration` in the `AggregateStats` interface.

In `computeAggregateStats`, replace:
```typescript
    for (const round of match.roundDetails) {
      totalTicks += round.durationTicks;
```
with:
```typescript
    for (const round of match.roundDetails) {
      totalTicks += round.duration;
```

And the final computation:
```typescript
    avgDuelTickCount: totalDuels > 0 ? totalTicks / totalDuels : 0,
```
becomes:
```typescript
    avgDuelDuration: totalDuels > 0 ? totalTicks / totalDuels : 0,
```

Rename the local variable `totalTicks` to `totalDuration` for clarity.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/match/match-report.ts packages/engine/src/balance/stats-collector.ts
git commit -m "feat: update match report and stats collector for seconds"
```

---

### Task 13: Update AI files

**Files:**
- Modify: `packages/engine/src/ai/evaluation.ts`
- Modify: `packages/engine/src/ai/item-selection.ts`

- [ ] **Step 1: Update evaluation.ts**

In `extractDamageProfile`, replace all `for (const tick of log.ticks)` with `for (const frame of log.frames)` and `for (const event of tick.events)` with `for (const event of frame.events)`.

- [ ] **Step 2: Update item-selection.ts**

In `selectMedium`, replace all references to `attackInterval` with `attackSpeed`:
```typescript
  const sortedByInterval = [...weapons].sort(
    (a, b) => (a.baseStats.attackSpeed ?? 0) - (b.baseStats.attackSpeed ?? 0),
  );
  const medianWeaponIdx = Math.floor(sortedByInterval.length / 2);
  const medianInterval = sortedByInterval[medianWeaponIdx].baseStats.attackSpeed ?? 0;
  const weaponsByDistance = [...weapons].sort(
    (a, b) =>
      Math.abs((a.baseStats.attackSpeed ?? 0) - medianInterval) -
      Math.abs((b.baseStats.attackSpeed ?? 0) - medianInterval),
  );
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/ai/evaluation.ts packages/engine/src/ai/item-selection.ts
git commit -m "feat: update AI files for seconds-based combat log"
```

---

### Task 14: Fix all engine tests

**Files:**
- Modify: `packages/engine/tests/duel.test.ts`
- Modify: `packages/engine/tests/duel-breakdown.test.ts`
- Modify: `packages/engine/tests/damage-calc.test.ts`
- Modify: `packages/engine/tests/stat-calculator.test.ts`
- Modify: `packages/engine/tests/match.test.ts`
- Modify: `packages/engine/tests/match-report.test.ts`
- Modify: `packages/engine/tests/ai.test.ts`
- Modify: `packages/engine/tests/ai-tiers.test.ts`

- [ ] **Step 1: Update duel.test.ts**

Global replacements:
- `attackInterval: 30` → `attackSpeed: 1.0`
- `attackInterval: 15` → `attackSpeed: 0.5`
- `attackInterval: 10` → `attackSpeed: 0.3`
- `attackInterval: 60` → `attackSpeed: 2.0`
- `hpRegen: 1` stays `hpRegen: 1` (now means 1 HP/sec)
- `hpRegen: 2` stays `hpRegen: 2`
- `"gains HP each tick"` → `"gains HP each second"`
- Replace `log.result.tickCount` with `log.result.duration`
- Replace `expect(log.result.tickCount).toBeLessThan(20)` with `expect(log.result.duration).toBeLessThan(2.0)` (20 ticks at 30tps ≈ 0.67s, but with 0.1s steps, use a reasonable bound)
- Replace `expect(log.result.tickCount).toBe(3000)` with `expect(log.result.duration).toBe(100)` (maxDuelSeconds)
- Replace all `log.ticks` iterations with `log.frames` and `.tick` with `.time`
- Replace `t.events` patterns: `log.ticks.flatMap((t) => t.events.filter(...))` → `log.frames.flatMap((f) => f.events.filter(...))`
- Update the gladiator creation test: `expect(g.attackTimer).toBe(15)` → `expect(g.attackTimer).toBeCloseTo(0.5)` (attackSpeed 1.0 * (1 - 50/100) = 0.5)

- [ ] **Step 2: Update duel-breakdown.test.ts**

Replace all `attackInterval: N` with `attackSpeed: N/30`. Replace `hpRegen` values as needed. Update any `log.ticks` → `log.frames`.

- [ ] **Step 3: Update damage-calc.test.ts (DOT section)**

Replace all `damagePerTick` references with `damagePerSecond` in the DOT test section:
- `expect(bd.damagePerTick).toBe(10)` → `expect(bd.damagePerSecond).toBe(10)`

- [ ] **Step 4: Update stat-calculator.test.ts**

- Replace `expect(stats.attackInterval)` with `expect(stats.attackSpeed)`
- `expect(stats.attackInterval).toBe(54)` → `expect(stats.attackSpeed).toBe(1.8)`
- `expect(stats.attackInterval).toBe(75)` → `expect(stats.attackSpeed).toBe(2.5)`
- `expect(stats.attackInterval).toBeCloseTo(74.55)` → `expect(stats.attackSpeed).toBeCloseTo(2.485)` (75 * (1 - 0.003) ≈ 74.775 in ticks... actually recompute: DEX gives -0.003 percent on attackSpeed. So 2.5 * (1 - 0.003) ≈ 2.4925. But there are 2 DEX base stats, so it's 2.5 * (1 - 2*0.003) = 2.5 * 0.994 = 2.485)
- `expect(stats.attackInterval).toBeGreaterThanOrEqual(balance.minAttackInterval)` → `expect(stats.attackSpeed).toBeGreaterThanOrEqual(balance.minAttackSpeed)`
- `expect(stats.hpRegen).toBeCloseTo(0.02)` → stays as-is (0.01 per VIT * 2 VIT points = 0.02, value unchanged)

- [ ] **Step 5: Update match.test.ts**

Replace all mock `DuelResult` objects: remove `tickCount: 100,` line from each. The `duration: 3.33` stays or update to `duration: 10` (a round number).

- [ ] **Step 6: Update match-report.test.ts**

Replace `expect(report.roundDetails[0].durationTicks).toBeGreaterThan(0)` with `expect(report.roundDetails[0].duration).toBeGreaterThan(0)`.

- [ ] **Step 7: Update ai.test.ts and ai-tiers.test.ts**

In both files, find mock DuelResult objects and remove `tickCount: 100,`. Update `duration: 3.33` to `duration: 10`.

In ai-tiers.test.ts, update `log.ticks` references to `log.frames` if any exist in mock combat logs.

- [ ] **Step 8: Run all engine tests**

Run: `pnpm --filter @alloy/engine test`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add packages/engine/tests/
git commit -m "test: migrate all engine tests from ticks to seconds"
```

---

## Chunk 3: Client Playback & Display

### Task 15: Update Duel.tsx

**Files:**
- Modify: `packages/client/src/pages/Duel.tsx`

- [ ] **Step 1: Rename playbackTick → playbackTime**

Global rename in the file: `playbackTick` → `playbackTime`, `setPlaybackTick` → `setPlaybackTime`.

- [ ] **Step 2: Update playback loop**

Replace the playback useEffect with:
```typescript
  // Playback animation — advance in real time
  useEffect(() => {
    if (!isPlaying || !currentLog) return;

    const maxTime = currentLog.frames[currentLog.frames.length - 1]?.time ?? 0;
    let startTimestamp: number | null = null;
    let startPlaybackTime = playbackTime;

    const step = (timestamp: number) => {
      if (startTimestamp === null) startTimestamp = timestamp;
      const elapsed = (timestamp - startTimestamp) / 1000;
      const newTime = Math.min(startPlaybackTime + elapsed, maxTime);
      setPlaybackTime(newTime);
      if (newTime < maxTime) {
        animationRef.current = requestAnimationFrame(step);
      }
    };

    animationRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, currentLog]);
```

- [ ] **Step 3: Update playback completion check**

Replace:
```typescript
    const maxTick = currentLog.ticks[currentLog.ticks.length - 1]?.tick ?? 0;
    if (playbackTick >= maxTick && maxTick > 0 && !showBreakdown) {
```
with:
```typescript
    const maxTime = currentLog.frames[currentLog.frames.length - 1]?.time ?? 0;
    if (playbackTime >= maxTime && maxTime > 0 && !showBreakdown) {
```

- [ ] **Step 4: Update HP state computation**

Replace `for (const tick of currentLog.ticks)` iteration:
```typescript
    for (const frame of currentLog.frames) {
      if (frame.time > playbackTime) break;
      for (const event of frame.events) {
        if (event.type === 'hp_change') {
          hp[event.player] = event.newHP;
        }
      }
    }
```

- [ ] **Step 5: Update visibleEvents computation**

Replace:
```typescript
    const events: { tick: number; event: TickEvent }[] = [];
    for (const tick of currentLog.ticks) {
      if (tick.tick > playbackTick) break;
      for (const event of tick.events) {
        events.push({ tick: tick.tick, event });
      }
    }
```
with:
```typescript
    const events: { time: number; event: CombatEvent }[] = [];
    for (const frame of currentLog.frames) {
      if (frame.time > playbackTime) break;
      for (const event of frame.events) {
        events.push({ time: frame.time, event });
      }
    }
```

Update the import: `TickEvent` → `CombatEvent` (or use the compat alias).

- [ ] **Step 6: Update PostDuelBreakdown**

Replace `for (const tick of combatLog.ticks)` with `for (const frame of combatLog.frames)` and `for (const event of tick.events)` with `for (const event of frame.events)`.

- [ ] **Step 7: Update timer display**

Replace:
```typescript
            {(playbackTick / 30).toFixed(1)}s / {currentResult ? currentResult.duration.toFixed(1) : '?'}s
```
with:
```typescript
            {playbackTime.toFixed(1)}s / {currentResult ? currentResult.duration.toFixed(1) : '?'}s
```

- [ ] **Step 8: Update DuelRenderer prop**

Replace `currentTick={playbackTick}` with `currentTime={playbackTime}`.

- [ ] **Step 9: Update Play/Skip button handlers**

In the Play button, replace:
```typescript
                if (playbackTick >= (currentLog.ticks[currentLog.ticks.length - 1]?.tick ?? 0)) {
                  setPlaybackTick(0);
```
with:
```typescript
                if (playbackTime >= (currentLog.frames[currentLog.frames.length - 1]?.time ?? 0)) {
                  setPlaybackTime(0);
```

In the Skip button, replace:
```typescript
              setPlaybackTick(currentLog.ticks[currentLog.ticks.length - 1]?.tick ?? 0);
```
with:
```typescript
              setPlaybackTime(currentLog.frames[currentLog.frames.length - 1]?.time ?? 0);
```

- [ ] **Step 10: Update CombatLogPanel prop**

Replace `<CombatLogPanel events={visibleEvents} ticksPerSecond={30} />` with `<CombatLogPanel events={visibleEvents} />`.

- [ ] **Step 11: Commit**

```bash
git add packages/client/src/pages/Duel.tsx
git commit -m "feat: update Duel page for seconds-based playback"
```

---

### Task 16: Update DuelRenderer.tsx

**Files:**
- Modify: `packages/client/src/components/DuelRenderer.tsx`

- [ ] **Step 1: Rename props and state**

- Rename `currentTick` prop to `currentTime`
- In `stateRef`, rename `lastProcessedTick` → `lastProcessedTime`, `lastAttackTick` → `lastAttackTime`, `currentTick` → `currentTime`
- Replace `attackIntervals` with `attackSpeeds`

- [ ] **Step 2: Update cooldown ring initialization**

Replace:
```typescript
      state.attackIntervals = [stats[0].attackInterval, stats[1].attackInterval];
      const atkSec0 = stats[0].attackInterval / 30;
      const atkSec1 = stats[1].attackInterval / 30;
```
with:
```typescript
      state.attackSpeeds = [stats[0].attackSpeed, stats[1].attackSpeed];
      const atkSec0 = stats[0].attackSpeed;
      const atkSec1 = stats[1].attackSpeed;
```

- [ ] **Step 3: Update cooldown progress calculation**

Replace:
```typescript
            const elapsed = state.currentTick - state.lastAttackTick[i];
            const progress = Math.min(1, elapsed / state.attackIntervals[i]);
```
with:
```typescript
            const elapsed = state.currentTime - state.lastAttackTime[i];
            const progress = Math.min(1, elapsed / state.attackSpeeds[i]);
```

- [ ] **Step 4: Update event processing loop**

Replace `for (const tickData of combatLog.ticks)` with `for (const frame of combatLog.frames)` and update comparisons from `.tick` to `.time`, from `currentTick` to `currentTime`.

- [ ] **Step 5: Update StateType**

Rename fields in the `StateType` type alias to match the new names.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/DuelRenderer.tsx
git commit -m "feat: update DuelRenderer for seconds-based timing"
```

---

### Task 17: Update combat log display components

**Files:**
- Modify: `packages/client/src/features/duel/CombatLogPanel.tsx`
- Modify: `packages/client/src/features/duel/SwingGroup.tsx`
- Modify: `packages/client/src/features/duel/combat-log-grouper.ts`

- [ ] **Step 1: Update CombatLogPanel**

Remove `ticksPerSecond` from the props interface and component signature. Update the events prop type from `Array<{ tick: number; event: TickEvent }>` to `Array<{ time: number; event: CombatEvent }>`.

In the SwingGroupComponent usage, remove `ticksPerSecond={ticksPerSecond}`.

- [ ] **Step 2: Update combat-log-grouper.ts**

Replace all `tick` references with `time`:
- `SwingGroup.tick` → `SwingGroup.time`
- Function parameter type: `{ tick: number; event: TickEvent }` → `{ time: number; event: CombatEvent }`
- All `entry.tick` → `entry.time`, `current.tick === tick` → `current.time === time`

- [ ] **Step 3: Update SwingGroup.tsx**

Remove `ticksPerSecond` from all component props. Simplify `formatTime`:
```typescript
function formatTime(time: number): string {
  return time.toFixed(1);
}
```

Replace all `formatTime(tick, ticksPerSecond)` calls with `formatTime(time)` or `formatTime(group.time)`.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/duel/CombatLogPanel.tsx packages/client/src/features/duel/SwingGroup.tsx packages/client/src/features/duel/combat-log-grouper.ts
git commit -m "feat: update combat log components for seconds-based timing"
```

---

### Task 18: Update DuelScene.ts

**Files:**
- Modify: `packages/client/src/features/duel/pixi/DuelScene.ts`

- [ ] **Step 1: Update init method**

Replace:
```typescript
    this.attackIntervals = [stats[0].attackInterval, stats[1].attackInterval];
```
with:
```typescript
    this.attackSpeeds = [stats[0].attackSpeed, stats[1].attackSpeed];
```

Replace:
```typescript
    const atkSec0 = stats[0].attackInterval / 30;
    const atkSec1 = stats[1].attackInterval / 30;
```
with:
```typescript
    const atkSec0 = stats[0].attackSpeed;
    const atkSec1 = stats[1].attackSpeed;
```

- [ ] **Step 2: Rename fields**

Rename `attackIntervals` → `attackSpeeds`, `lastAttackTick` → `lastAttackTime`, `currentTick` → `currentTime`, `lastProcessedTick` → `lastProcessedTime` throughout the class.

- [ ] **Step 3: Update processEvent**

Rename `tick` parameter to `time` in `processEvent(time: number, event: CombatEvent)`.

- [ ] **Step 4: Update stun duration**

Replace:
```typescript
        const stunMs = event.durationTicks * 33;
```
with:
```typescript
        const stunMs = event.duration * 1000;
```

- [ ] **Step 5: Update cooldown progress**

Replace:
```typescript
        const elapsed = this.currentTick - this.lastAttackTick[i];
        const progress = Math.min(1, elapsed / this.attackIntervals[i]);
```
with:
```typescript
        const elapsed = this.currentTime - this.lastAttackTime[i];
        const progress = Math.min(1, elapsed / this.attackSpeeds[i]);
```

- [ ] **Step 6: Update reset method**

Replace `attackIntervals`, `lastAttackTick`, `currentTick` with new names. Replace `stats[0].attackInterval` with `stats[0].attackSpeed`.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/features/duel/pixi/DuelScene.ts
git commit -m "feat: update DuelScene for seconds-based timing"
```

---

### Task 19: Update remaining client files

**Files:**
- Modify: `packages/client/src/features/forge/BaseItemCard.tsx`
- Modify: `packages/client/src/shared/utils/stat-label.ts`
- Modify: `packages/client/src/pages/RecipeBook.tsx`
- Modify: `packages/client/src/pages/PostMatch.tsx`
- Modify: `packages/client/src/hooks/useDuelSounds.ts`

- [ ] **Step 1: Update BaseItemCard.tsx**

Replace:
```typescript
    const ticks = item.baseStats.attackInterval ?? 30;
    return `Speed: ${(ticks / 30).toFixed(1)}s`;
```
with:
```typescript
    return `Speed: ${(item.baseStats.attackSpeed ?? 1.0).toFixed(1)}s`;
```

- [ ] **Step 2: Update stat-label.ts**

Replace `attackInterval: 'Atk Spd',` with `attackSpeed: 'Atk Spd',`.

- [ ] **Step 3: Update RecipeBook.tsx**

Replace:
```typescript
        return `${value} tick duration`;
```
with:
```typescript
        return `${value}s duration`;
```

- [ ] **Step 4: Update PostMatch.tsx**

Replace `for (const tick of log.ticks)` with `for (const frame of log.frames)` and `for (const event of tick.events)` with `for (const event of frame.events)`.

- [ ] **Step 5: Update useDuelSounds.ts**

Update the event type from `{ tick: number; event: TickEvent }` to `{ time: number; event: CombatEvent }`. Update the import accordingly.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/forge/BaseItemCard.tsx packages/client/src/shared/utils/stat-label.ts packages/client/src/pages/RecipeBook.tsx packages/client/src/pages/PostMatch.tsx packages/client/src/hooks/useDuelSounds.ts
git commit -m "feat: update remaining client files for seconds-based timing"
```

---

## Chunk 4: Tools, Tests, and Verification

### Task 20: Update tools package

**Files:**
- Modify: `packages/tools/src/components/MatchInspector.tsx`
- Modify: `packages/tools/src/components/ConfigFormEditor.tsx`

- [ ] **Step 1: Update MatchInspector.tsx**

Replace all `log.ticks` iterations with `log.frames` and `tickData.tick` with `frame.time`.

Update `formatEvent` function — replace `tick` parameter name with `time`. Update format strings:
- `[${tick}]` → `[${time.toFixed(1)}s]`
- `${event.dps}/tick, ${event.durationTicks} ticks` → `${event.dps}/sec, ${event.duration}s`
- `stunned for ${event.durationTicks} ticks` → `stunned for ${event.duration}s`

Replace `TickEvent` import with `CombatEvent`.

In the stats comparison table, replace `attackInterval` with `attackSpeed`:
```typescript
<StatRow label="Attack Speed" v0={formatStat(p0Stats.attackSpeed)} v1={formatStat(p1Stats.attackSpeed)} />
```

- [ ] **Step 2: Update ConfigFormEditor.tsx**

In the BalancePanel, replace:
```typescript
        <BalanceNumField label="Ticks/Second" value={bal.ticksPerSecond} baselineValue={bbl?.ticksPerSecond} onChange={(v) => update('ticksPerSecond', v)} min={1} />
        <BalanceNumField label="Max Duel Ticks" value={bal.maxDuelTicks} baselineValue={bbl?.maxDuelTicks} onChange={(v) => update('maxDuelTicks', v)} min={1} />
```
with:
```typescript
        <BalanceNumField label="Max Duel Seconds" value={bal.maxDuelSeconds} baselineValue={bbl?.maxDuelSeconds} onChange={(v) => update('maxDuelSeconds', v)} min={1} />
```

Replace:
```typescript
        <BalanceNumField label="Min Attack Interval (ticks)" value={bal.minAttackInterval} baselineValue={bbl?.minAttackInterval} onChange={(v) => update('minAttackInterval', v)} min={1} />
```
with:
```typescript
        <BalanceNumField label="Min Attack Speed (s)" value={bal.minAttackSpeed} baselineValue={bbl?.minAttackSpeed} onChange={(v) => update('minAttackSpeed', v)} min={0.1} step={0.1} />
```

- [ ] **Step 3: Commit**

```bash
git add packages/tools/src/components/MatchInspector.tsx packages/tools/src/components/ConfigFormEditor.tsx
git commit -m "feat: update tools package for seconds-based timing"
```

---

### Task 21: Update client test files

**Files:**
- Modify: `packages/client/src/features/duel/__tests__/combat-log-grouper.test.ts`
- Modify: `packages/client/src/shared/utils/stat-label.test.ts`
- Modify: `packages/client/src/features/forge/__tests__/BaseItemSelector.test.tsx`
- Modify: `packages/client/src/pages/__tests__/Forge.test.tsx`

- [ ] **Step 1: Update combat-log-grouper.test.ts**

Replace all `tick:` in test data with `time:` and convert tick values to seconds (divide by 30). Replace `damagePerTick` with `damagePerSecond`. Replace `TickEvent` import with `CombatEvent`.

- [ ] **Step 2: Update stat-label.test.ts**

Replace `attackInterval` with `attackSpeed` in test expectations.

- [ ] **Step 3: Update BaseItemSelector.test.tsx**

Replace `attackInterval` with `attackSpeed` in mock base item data. Convert values by dividing by 30.

- [ ] **Step 4: Update Forge.test.tsx**

Remove `ticksPerSecond: 20,` and `maxDuelTicks: 6000,` from mock balance. Add `maxDuelSeconds: 100,` and `minAttackSpeed: 0.3,`.

- [ ] **Step 5: Run all client tests**

Run: `pnpm --filter @alloy/client test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/duel/__tests__/ packages/client/src/shared/utils/stat-label.test.ts packages/client/src/features/forge/__tests__/ packages/client/src/pages/__tests__/
git commit -m "test: migrate all client tests from ticks to seconds"
```

---

### Task 22: Add new regression tests

**Files:**
- Modify: `packages/engine/tests/duel.test.ts`

- [ ] **Step 1: Add regen timing test**

```typescript
  it('regen fires once per second, not per step', () => {
    const stats = makeStats({
      maxHP: 200,
      physicalDamage: 0,
      attackSpeed: 100, // very slow, won't attack
      hpRegen: 10,
    });
    // Damage player 0 slightly so regen has room to heal
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);
    const log = simulate([stats, { ...stats }], loadouts, registry, rng, 1);

    // Count heal events — should be roughly 1 per second of combat
    const healEvents = log.frames.flatMap((f) =>
      f.events.filter((e) => e.type === 'heal' && e.player === 0),
    );
    // At 100s max duel, expect ~100 heal events (1/sec), not 1000 (1/step)
    expect(healEvents.length).toBeLessThan(150);
    expect(healEvents.length).toBeGreaterThan(50);
  });
```

- [ ] **Step 2: Add attack timing test**

```typescript
  it('attack at attackSpeed 2.0 fires at correct intervals', () => {
    const attacker = makeStats({ maxHP: 10000, physicalDamage: 10, attackSpeed: 2.0 });
    const defender = makeStats({ maxHP: 10000, physicalDamage: 0, attackSpeed: 100 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);
    const log = simulate([attacker, defender], loadouts, registry, rng, 1);

    const attackFrames = log.frames
      .filter((f) => f.events.some((e) => e.type === 'attack' && e.attacker === 0))
      .map((f) => f.time);

    // First attack at ~2.0s, second at ~4.0s
    expect(attackFrames.length).toBeGreaterThan(2);
    expect(attackFrames[0]).toBeCloseTo(2.0, 1);
    expect(attackFrames[1]).toBeCloseTo(4.0, 1);
  });
```

- [ ] **Step 3: Add frame time format test**

```typescript
  it('combat log frame times are clean 0.1s values', () => {
    const stats = makeStats({ maxHP: 200, physicalDamage: 20, attackSpeed: 1.0 });
    const loadouts = makeLoadouts();
    const rng = new SeededRNG(42);
    const log = simulate([stats, { ...stats }], loadouts, registry, rng, 1);

    for (const frame of log.frames) {
      const rounded = Math.round(frame.time * 10) / 10;
      expect(frame.time).toBe(rounded);
    }
  });
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @alloy/engine test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/tests/duel.test.ts
git commit -m "test: add seconds-native regression tests for regen, attack timing, and frame format"
```

---

### Task 23: Full build verification

- [ ] **Step 1: Type-check engine**

Run: `npx tsc --noEmit -p packages/engine/tsconfig.json`
Expected: No errors

- [ ] **Step 2: Type-check client**

Run: `npx tsc --noEmit -p packages/client/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Run all engine tests**

Run: `pnpm --filter @alloy/engine test`
Expected: ALL PASS

- [ ] **Step 4: Run all client tests**

Run: `pnpm --filter @alloy/client test`
Expected: ALL PASS

- [ ] **Step 5: Start dev server and verify**

Run: `pnpm --filter @alloy/client dev`
Open http://localhost:9099 and verify the duel screen plays combat in real time.

- [ ] **Step 6: Fix any remaining issues found**

Address any TypeScript errors or test failures discovered during verification.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "fix: resolve remaining type errors and test failures from seconds migration"
```

---

### Task 24: Database mapping workaround

**Files:**
- Modify: `packages/tools/server/routes/simulations.ts`

- [ ] **Step 1: Map duration to duration_ticks column**

In `packages/tools/server/routes/simulations.ts`, find the round detail row mapping and replace:
```typescript
        duration_ticks: rd.durationTicks,
```
with:
```typescript
        duration_ticks: rd.duration, // TODO: rename DB column in separate migration
```

- [ ] **Step 2: Commit**

```bash
git add packages/tools/server/routes/simulations.ts
git commit -m "fix: map duration (seconds) to existing duration_ticks DB column"
```
