# Seconds-Native Engine Rewrite

**Date:** 2026-04-03
**Status:** Approved
**Scope:** Engine time model, combat log, client playback, balance data, tests

## Problem

The duel engine simulates at 30 ticks/second. HP regen fires every tick (30x/sec), DOTs tick every tick, and the combat log stores every tick that has events. This causes:

1. **Combat flashes by** — the client playback loop was advancing 1 tick per animation frame (60 ticks/sec at 60 FPS), making a 2-second attack play out in ~267ms.
2. **Combat log floods** — regen alone produces 30 entries per second of tiny HP changes, drowning out meaningful events like attacks and ability procs.
3. **Graphics flicker** — HP bars and damage numbers update 30x/sec with imperceptible changes.
4. **Balance is unreadable** — `attackInterval: 30` means "1 second" and `hpRegen: 5` means "150 HP/sec", requiring mental math everywhere.

## Solution

Replace the tick-based time model with a seconds-native system. All balance values, combat log timestamps, durations, and client playback use seconds as the base unit. The engine loop iterates in 0.1s steps (10 steps/second) internally, but this is an implementation detail — all public APIs and data speak seconds.

## Design

### 1. Time Model

**Engine loop:** Iterates in steps of 0.1s (`STEPS_PER_SECOND = 10`, a constant, not configurable). The loop counter is a step index but all public values are in seconds.

**Key conversions from old to new:**

| Old (ticks) | New (seconds) | Notes |
|---|---|---|
| `ticksPerSecond: 30` | Removed | Internal constant `STEPS_PER_SECOND = 10` |
| `maxDuelTicks: 3000` | `maxDuelSeconds: 100` | Same duration |
| `minAttackInterval: 9` (ticks) | `minAttackSpeed: 0.3` (seconds) | 9/30 = 0.3 |
| `attackInterval: 30` (ticks) | `attackSpeed: 1.0` (seconds) | Human-readable |
| `hpRegen: 5` (per tick) | `hpRegen: 5` (per second) | Value stays, meaning changes |
| `damagePerTick: N` | `damagePerSecond: N` | Value stays, meaning changes |
| `durationTicks: N` | `duration: N / 30` | Convert to seconds |
| `cooldownTicks: N` | `cooldown: N / 30` | Convert to seconds |

**Balance impact:** hpRegen and DOT damage values keep their numeric values but change meaning from "per tick" to "per second". This is effectively a 30x reduction in healing/DOT rate. This is intentional — the current rates were producing unreadable combat and will be rebalanced.

### 2. Engine Internals

**Step resolution:** `STEPS_PER_SECOND = 10` is a module-level constant in `duel-engine.ts`. Each step = 0.1s. The step size is `STEP_DURATION = 0.1`.

**Attack timers:** Count down by `STEP_DURATION` (0.1) per step. A weapon with `attackSpeed: 1.5` fires when its timer reaches 0, then resets to 1.5. Initiative reduces the initial timer by a percentage (unchanged logic, just in seconds).

**Regen:** Fires once per second by default. `GladiatorRuntime` gains a `regenAccumulator: number` (starts at 0). Each step adds `STEP_DURATION`. When accumulator >= `regenInterval` (default 1.0s), regen fires and accumulator resets. Buffs/modifiers can alter `regenInterval` (e.g. "50% faster regen" sets it to 0.5).

**DOTs:** Each `ActiveDOT` gains:
- `tickInterval: number` — seconds between damage ticks (default 1.0)
- `accumulator: number` — seconds since last tick (starts at 0)

Each step adds `STEP_DURATION` to the accumulator. When it crosses `tickInterval`, the DOT fires and accumulator resets. This is the modifier hook for future buffs/gems that alter DOT tick rate.

**Buffs, stuns, cooldowns:** Duration stored in seconds, decremented by `STEP_DURATION` per step. Expired when `<= 0`.

**Reflect buff:** `reflectTicksRemaining` → `reflectRemaining` (seconds), same decrement pattern.

### 3. Combat Event Types

**Rename `TickEvent` → `CombatEvent`.** All duration fields switch to seconds:

```typescript
// Field renames across all event/effect types:
durationTicks  → duration        // seconds
remainingTicks → remaining       // seconds
cooldownTicks  → cooldown        // seconds
damagePerTick  → damagePerSecond
```

### 4. Combat Log Structure

```typescript
// Before
interface CombatLog {
  seed: number;
  ticks: { tick: number; events: TickEvent[] }[];
  result: DuelResult;
}

// After
interface CombatLog {
  seed: number;
  frames: { time: number; events: CombatEvent[] }[];
  result: DuelResult;
}
```

`time` is in seconds (0.0, 0.1, 0.2, ...). Only steps that produce events get entries (same as current behavior).

### 5. DuelResult

```typescript
// Before
interface DuelResult {
  round: number;
  winner: 0 | 1;
  finalHP: [number, number];
  tickCount: number;
  duration: number; // tickCount / ticksPerSecond
  wasTiebreak: boolean;
  p0DamageDealt: number;
  p1DamageDealt: number;
}

// After
interface DuelResult {
  round: number;
  winner: 0 | 1;
  finalHP: [number, number];
  duration: number; // seconds (direct, no conversion)
  wasTiebreak: boolean;
  p0DamageDealt: number;
  p1DamageDealt: number;
}
```

`tickCount` is removed. `duration` is computed directly from the step counter.

### 6. GladiatorRuntime

```typescript
interface GladiatorRuntime {
  playerId: 0 | 1;
  currentHP: number;
  maxHP: number;
  barrier: number;
  stats: DerivedStats;
  activeDOTs: ActiveDOT[];
  activeBuffs: ActiveBuff[];
  cooldowns: Map<string, number>;    // triggerId → seconds until available
  attackTimer: number;               // seconds until next attack
  stunTimer: number;                 // seconds remaining stunned
  isLowHP: boolean;
  reflectMultiplier: number;
  reflectRemaining: number;          // seconds (was reflectTicksRemaining)
  regenAccumulator: number;          // seconds since last regen tick
  regenInterval: number;             // seconds between regen ticks (default 1.0)
}

interface ActiveDOT {
  element: Element;
  damagePerSecond: number;           // was damagePerTick
  remaining: number;                 // seconds left (was remainingTicks)
  tickInterval: number;              // seconds between ticks (default 1.0)
  accumulator: number;               // seconds since last tick
  sourceAffixId: string;
  stacks: number;
  sourcePlayerId: 0 | 1;
}

interface ActiveBuff {
  stat: keyof DerivedStats;
  value: number;
  remaining: number;                 // seconds (was remainingTicks)
  sourceId: string;
}
```

### 7. DerivedStats

```typescript
interface DerivedStats {
  maxHP: number;
  physicalDamage: number;
  elementalDamage: Record<Element, number>;
  attackSpeed: number;               // seconds between attacks (was attackInterval in ticks)
  armor: number;
  resistances: Record<Element, number>;
  critChance: number;
  critMultiplier: number;
  critAvoidance: number;
  lifestealPercent: number;
  blockChance: number;
  blockAmount: number;
  blockBreakChance: number;
  dodgeChance: number;
  thornsDamage: number;
  barrierAmount: number;
  hpRegen: number;                   // HP per second (was per tick)
  armorPenetration: number;
  elementalPenetration: number;
  stunChance: number;
  slowPercent: number;
  dotMultiplier: number;
  initiative: number;
}
```

Default `attackSpeed` changes from `30` to `1.0`. Default `hpRegen` remains `0`.

### 8. Balance Config

```typescript
interface BalanceConfig {
  baseHP: number;
  maxDuelSeconds: number;            // was maxDuelTicks
  baseCritMultiplier: number;
  minAttackSpeed: number;            // seconds, was minAttackInterval in ticks

  // ticksPerSecond removed entirely

  // All other fields unchanged:
  fluxPerRound, quickMatchFlux, fluxCosts,
  draftPoolPerRound, draftPicksPerPlayer, draftPoolSizeQuick,
  tierDistribution, draftTimerSeconds, forgeTimerSeconds,
  archetypeMinOrbs, baseStatScaling, statCaps
}
```

**balance.json changes:**
```json
{
  "baseHP": 200,
  "maxDuelSeconds": 100,
  "baseCritMultiplier": 150,
  "minAttackSpeed": 0.3,
  ...
}
```

**baseStatScaling VIT armor hpRegen:** `0.01` → `0.3` (preserving: 0.01 per-tick * 30 ticks/sec = 0.3 per-second).

**baseStatScaling DEX weapon attackSpeed:** `0.003` — this was a per-tick reduction. Needs conversion to seconds. `0.003 ticks * 30 = 0.09s` reduction per DEX point? Review during balance pass. For now, keep as `0.003` and note it needs tuning.

### 9. Affix Data Migration

**hpRegen affixes:** Values stay as-is, meaning changes from per-tick to per-second.
- Tier 1: 5 HP/sec, Tier 2: 8 HP/sec, Tier 3: 12 HP/sec, Tier 4: 14 HP/sec

**Trigger/effect durations:** All `durationTicks` values divided by 30 to convert to seconds. All `cooldownTicks` values divided by 30.

**DOT trigger effects:** `dps` field stays as-is (already named "dps" = damage per second).

### 10. Client Playback

**Duel.tsx playback loop:** Tracks elapsed real time. `playbackTick` → `playbackTime` (seconds). Finds the last `frame` at or before `playbackTime`:

```typescript
const step = (timestamp: number) => {
  if (startTime === null) startTime = timestamp;
  const elapsed = (timestamp - startTime) / 1000;
  const newTime = Math.min(startPlaybackTime + elapsed, maxTime);
  setPlaybackTime(newTime);
  if (newTime < maxTime) {
    animationRef.current = requestAnimationFrame(step);
  }
};
```

**DuelRenderer:** `currentTick` prop → `currentTime: number` (seconds). Event processing iterates `frames` comparing `frame.time <= currentTime`. Cooldown ring progress: `elapsed / attackSpeed` (no `/ 30` conversion).

**CombatLogPanel & SwingGroup:** `ticksPerSecond` prop removed. `formatTime` simplifies to `time.toFixed(1)`. Grouper works on `{ time: number; event: CombatEvent }`.

**BaseItemCard:** `attackSpeed` displays directly as `"Speed: 1.5s"` — no division.

**RecipeBook:** Duration displays directly in seconds — no `"tick duration"` text.

**PostMatch:** Iterates `frames` instead of `ticks`.

### 11. Trigger System

`TriggerDef` changes:
```typescript
interface TriggerDef {
  affixId: string;
  condition: TriggerCondition;
  chance: number;           // 0-1 (unchanged)
  cooldown: number;         // seconds (was cooldownTicks)
  effect: TriggerEffect;
}
```

`TriggerEffect` variants — all `durationTicks` → `duration` (seconds):
```typescript
type TriggerEffect =
  | { kind: 'apply_dot'; element: Element; dps: number; duration: number }
  | { kind: 'bonus_damage'; amount: number; damageType: 'physical' | Element }
  | { kind: 'heal'; amount: number; isPercent: boolean }
  | { kind: 'gain_barrier'; amount: number }
  | { kind: 'stun'; duration: number }
  | { kind: 'stat_buff'; stat: keyof DerivedStats; value: number; duration: number }
  | { kind: 'reflect_damage'; multiplier: number; duration: number };
```

### 12. Match Report

`RoundReport.durationTicks` → `RoundReport.duration` (seconds). Stats collector sums seconds instead of ticks.

### 13. Test Strategy

**Existing engine tests (duel.test.ts):** Migrate values:
- `attackInterval: 30` → `attackSpeed: 1.0`
- `attackInterval: 15` → `attackSpeed: 0.5`
- `attackInterval: 10` → `attackSpeed: 0.33`
- `attackInterval: 60` → `attackSpeed: 2.0`
- Assertions on `tickCount` → assertions on `duration`
- `hpRegen: 1` stays `hpRegen: 1` (now means 1 HP/sec, fires once/sec)
- Test description "gains HP each tick" → "gains HP each second"

**New regression tests:**
- Regen fires exactly once per second (not per step)
- DOT fires at its `tickInterval` cadence (default 1.0s)
- DOT with `tickInterval: 0.5` fires twice per second
- Attack at `attackSpeed: 2.0` fires at t=2.0, t=4.0, etc.
- Combat log `frames` have `time` values in clean 0.1s increments
- `duration` field matches last frame time
- Regen with modified `regenInterval: 0.5` fires twice per second

**Playwright tests:**
- Playback duration is proportional to real duel duration (not instant)
- Combat log entries appear at human-readable pace
- HP bars update smoothly without flickering

**Existing test migration:**
- `stat-calculator.test.ts`: `hpRegen: 0.02` → update expected value to match new VIT scaling
- `Forge.test.tsx`: Remove `ticksPerSecond` from mock balance, add `maxDuelSeconds`
- `damage-calc.test.ts`: `damagePerTick` → `damagePerSecond` in DOT breakdown tests

## Files Changed

### Engine package
| File | Change |
|---|---|
| `types/balance.ts` | Remove `ticksPerSecond`, `maxDuelTicks`, `minAttackInterval`; add `maxDuelSeconds`, `minAttackSpeed` |
| `types/derived-stats.ts` | `attackInterval` → `attackSpeed` (seconds); `hpRegen` comment → per second |
| `types/combat.ts` | `TickEvent` → `CombatEvent`; all `*Ticks` → seconds; `ActiveDOT` gains `tickInterval`/`accumulator`; `GladiatorRuntime` gains `regenAccumulator`/`regenInterval` |
| `types/damage-breakdown.ts` | `damagePerTick` → `damagePerSecond` |
| `types/match-report.ts` | `durationTicks` → `duration` |
| `data/balance.json` | Migrate all values per Section 8 |
| `data/schemas.ts` | Update Zod schema to match new BalanceConfig |
| `data/affixes.json` | Trigger durations / 30; hpRegen values stay |
| `duel/duel-engine.ts` | Rewrite loop to 0.1s steps; regen/DOT accumulator pattern; seconds throughout |
| `duel/gladiator.ts` | `attackTimer` in seconds; `regenAccumulator`/`regenInterval` init |
| `duel/combat-log.ts` | `ticks` → `frames`; `tick` → `time` |
| `duel/damage-calc.ts` | `damagePerTick` → `damagePerSecond` |
| `duel/trigger-system.ts` | `cooldownTicks` → `cooldown` (seconds) |
| `forge/stat-calculator.ts` | `attackInterval` → `attackSpeed` mapping |
| `match/match-report.ts` | `durationTicks` → `duration` |
| `balance/stats-collector.ts` | Sum seconds instead of ticks |
| `tests/duel.test.ts` | Migrate all tick values to seconds |
| `tests/duel-breakdown.test.ts` | Migrate values |
| `tests/damage-calc.test.ts` | `damagePerTick` → `damagePerSecond` |
| `tests/stat-calculator.test.ts` | Update expected hpRegen |
| `tests/data.test.ts` | Remove `ticksPerSecond` assertion |

### Client package
| File | Change |
|---|---|
| `pages/Duel.tsx` | `playbackTick` → `playbackTime`; iterate `frames`; remove `/ 30` conversions |
| `components/DuelRenderer.tsx` | `currentTick` → `currentTime`; remove `/ 30` from cooldown rings |
| `features/duel/CombatLogPanel.tsx` | Remove `ticksPerSecond` prop |
| `features/duel/SwingGroup.tsx` | Remove `ticksPerSecond`; simplify `formatTime` |
| `features/duel/combat-log-grouper.ts` | `tick` → `time` throughout |
| `features/duel/pixi/DuelScene.ts` | Remove `/ 30` conversions |
| `features/forge/BaseItemCard.tsx` | Display `attackSpeed` directly |
| `pages/PostMatch.tsx` | Iterate `frames` instead of `ticks` |
| `pages/RecipeBook.tsx` | Display duration in seconds |
| `hooks/useDuelSounds.ts` | Update types only |
| `pages/__tests__/Forge.test.tsx` | Update mock balance |

### Tools package
| File | Change |
|---|---|
| `components/MatchInspector.tsx` | Update combat log iteration |
| `components/ConfigFormEditor.tsx` | Update field names |

## Risks

1. **Balance reset** — Healing/DOT rates change dramatically. Mitigated: balance passes are already planned.
2. **Floating point drift** — 0.1s steps accumulate rounding errors over 100s. Mitigated: use `Math.round(time * 10) / 10` for frame timestamps to snap to clean 0.1s values.
3. **Wide blast radius** — ~146 references across the codebase. Mitigated: TypeScript will catch most breakage at compile time since field names are changing (not just values). Existing test suite covers engine behavior.
