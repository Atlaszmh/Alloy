# Combat Phase Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the combat engine to use integer point-based stats, add base weapon/armor selection, and redesign the duel UI with per-swing combat logs and color-coded floating damage text.

**Architecture:** Three-phase layered refactor — engine stat model first (no UI changes), then forge item selection UI, then combat UI redesign. Engine is the single source of truth; tools package is a pure consumer.

**Tech Stack:** TypeScript, Vitest, React, Zustand, PixiJS v7

**Spec:** `docs/superpowers/specs/2026-04-01-combat-redesign-design.md`

---

## Chunk 1: Engine Stat Model & Damage Breakdown

### Task 1: Convert DerivedStats from fractions to integer points

**Files:**
- Modify: `packages/engine/src/types/derived-stats.ts`
- Modify: `packages/engine/src/data/balance.json`
- Modify: `packages/engine/src/types/balance.ts`
- Test: `packages/engine/tests/derived-stats.test.ts`

- [ ] **Step 1: Write test for integer-based DerivedStats defaults**

```typescript
// packages/engine/tests/derived-stats.test.ts
import { describe, it, expect } from 'vitest';
import { createEmptyDerivedStats } from '../src/types/derived-stats.js';

describe('createEmptyDerivedStats', () => {
  it('returns integer-scale defaults', () => {
    const s = createEmptyDerivedStats();
    // All percentage stats are 0 (integer %, not 0.0 fraction)
    expect(s.armor).toBe(0);
    expect(s.critChance).toBe(0);
    expect(s.dodgeChance).toBe(0);
    expect(s.blockChance).toBe(0);
    expect(s.lifestealPercent).toBe(0);
    expect(s.armorPenetration).toBe(0);
    expect(s.elementalPenetration).toBe(0);
    // Resistances default to 0
    expect(s.resistances.fire).toBe(0);
    expect(s.resistances.shadow).toBe(0);
    expect(s.resistances.chaos).toBe(0);
    // Non-percentage stats unchanged
    expect(s.attackInterval).toBe(30);
    expect(s.critMultiplier).toBe(150); // 150 = 1.5x, integer scale
    expect(s.dotMultiplier).toBe(100); // 100 = 1.0x baseline
    expect(s.maxHP).toBe(0);
    // New field
    expect(s.blockAmount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/derived-stats.test.ts`
Expected: FAIL — `critMultiplier` returns 1.5 not 150, `dotMultiplier` returns 1 not 100, no `blockAmount` field

- [ ] **Step 3: Update DerivedStats interface and factory**

In `packages/engine/src/types/derived-stats.ts`:
- Add `blockAmount: number` to the `DerivedStats` interface
- Change `createEmptyDerivedStats()` defaults:
  - `critMultiplier: 150` (was 1.5)
  - `dotMultiplier: 100` (was 1)
  - `blockAmount: 0` (new)
- Also convert: `critAvoidance`, `blockBreakChance`, `hpRegen`, `stunChance`, `slowPercent`, `initiative` to integer scale (all were 0–1.0 fractions, now integer percentages)
- Update JSDoc comments to note integer scale (e.g., `armor: number // integer points, 1 = 1% reduction`)

- [ ] **Step 4: Update balance.json stat caps to integer scale**

In `packages/engine/src/data/balance.json`:
- `critChance`: `{ "min": 0, "max": 75 }` (was 0.95 — note: cap changes from 95% to 75% per spec)
- `dodgeChance`: `{ "min": 0, "max": 50 }` (was 0.75)
- `blockChance`: `{ "min": 0, "max": 50 }` (was 0.75)
- All resistance caps: `{ "min": 0, "max": 90 }` (was 0.90)
- Add missing caps: `shadowResistance`, `chaosResistance`
- Normalize any "ice" references to "cold"
- `baseCritMultiplier: 150` (was 1.5)
- `minAttackInterval: 9` (unchanged, already in ticks)

- [ ] **Step 5: Update BalanceConfig type if needed**

In `packages/engine/src/types/balance.ts`:
- Verify `statCaps` type allows the new cap keys — it uses `Record<string, { min: number; max: number }>` so no type change needed, just ensure the data matches.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/derived-stats.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/types/derived-stats.ts packages/engine/src/data/balance.json packages/engine/src/types/balance.ts packages/engine/tests/derived-stats.test.ts
git commit -m "refactor: convert DerivedStats to integer point scale"
```

---

### Task 2: Update stat-calculator.ts for integer scale

**Files:**
- Modify: `packages/engine/src/forge/stat-calculator.ts`
- Modify: `packages/engine/src/data/affixes.json`
- Modify: `packages/engine/src/data/base-items.json`
- Test: `packages/engine/tests/stat-calculator.test.ts`

- [ ] **Step 1: Write test for integer-scale stat calculation**

```typescript
// packages/engine/tests/stat-calculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateStats } from '../src/forge/stat-calculator.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createEmptyLoadout } from '../src/types/item.js';

describe('calculateStats integer scale', () => {
  let registry: DataRegistry;

  beforeAll(() => {
    const data = loadAndValidateData();
    registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  });

  it('sword base stats produce integer-scale values', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const stats = calculateStats(loadout, registry);
    // Armor should be integer points (e.g., 20 for chainmail), not 0.xx fraction
    expect(stats.armor).toBeGreaterThanOrEqual(1);
    expect(stats.armor).toBeLessThan(100);
    // Attack interval still in ticks
    expect(stats.attackInterval).toBeGreaterThanOrEqual(9);
    // critChance should be integer % (0-75), not 0.xx
    expect(stats.critChance).toBeGreaterThanOrEqual(0);
    expect(stats.critChance).toBeLessThanOrEqual(75);
  });

  it('caps are enforced at integer scale', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    const stats = calculateStats(loadout, registry);
    expect(stats.dodgeChance).toBeLessThanOrEqual(50);
    expect(stats.blockChance).toBeLessThanOrEqual(50);
    expect(stats.resistances.fire).toBeLessThanOrEqual(90);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/stat-calculator.test.ts`
Expected: FAIL — stats are still fractional

- [ ] **Step 3: Update base-items.json to new schema**

Replace `inherentBonuses` with `baseStats: Record<string, number>` for all 14 items. Remove `unlockLevel`. Use integer values.

Example sword entry:
```json
{
  "id": "sword",
  "type": "weapon",
  "name": "Sword",
  "baseStats": {
    "physicalDamage": 40,
    "attackInterval": 54,
    "critChance": 5
  },
  "description": "Balanced all-rounder"
}
```

Example chainmail entry:
```json
{
  "id": "chainmail",
  "type": "armor",
  "name": "Chainmail",
  "baseStats": {
    "armor": 20,
    "maxHP": 20,
    "blockChance": 5
  },
  "description": "Balanced protection"
}
```

Full item list per spec tables — 7 weapons, 7 armors with stats matching the design spec.

- [ ] **Step 4: Update BaseItemDef type**

In `packages/engine/src/types/item.ts`:
```typescript
interface BaseItemDef {
  id: string;
  type: 'weapon' | 'armor';
  name: string;
  baseStats: Record<string, number>;
  description: string;
}
```
Remove `inherentBonuses` and `unlockLevel` fields.

- [ ] **Step 5: Update affixes.json values to integer scale**

Convert all fractional stat values to integer scale:
- `critChance: 0.05` → `critChance: 5`
- `dodgeChance: 0.03` → `dodgeChance: 3`
- `armor: 0.12` → `armor: 12`
- `lifesteal: 0.1` → `lifesteal: 10`
- All resistance values: multiply by 100
- `critDamage` values: multiply by 100 (e.g., 0.15 → 15, added to base 150)
- `armorPenetration`/`elementalPenetration`: multiply by 100

- [ ] **Step 6: Update stat-calculator.ts**

In `packages/engine/src/forge/stat-calculator.ts`:

1. **Change base item initialization** (around line 241-250): Instead of iterating `inherentBonuses`, read `baseStats` as flat additions:
```typescript
// Apply base item stats as flat modifiers
const weapon = registry.getBaseItem(loadout.weapon.baseItemId);
const armor = registry.getBaseItem(loadout.armor.baseItemId);
for (const [stat, value] of Object.entries(weapon.baseStats)) {
  addToBucket(buckets, { stat, op: 'flat', value });
}
for (const [stat, value] of Object.entries(armor.baseStats)) {
  addToBucket(buckets, { stat, op: 'flat', value });
}
```

2. **Update applyCaps** (around line 368-377): Change cap values to match integer scale from balance.json. The caps are loaded from `balance.statCaps` so this should happen automatically once balance.json is updated.

3. **Verify percent modifiers still work**: Percent modifiers in affixes.json should still be percentage-of-current (e.g., `{ stat: "armor", op: "percent", value: 20 }` means +20% of current armor value). This is already how `applyBucketsToStats` works.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/stat-calculator.test.ts`
Expected: PASS

- [ ] **Step 8: Run existing tests to check for regressions**

Run: `cd packages/engine && npx vitest run`
Expected: Some existing tests may break due to the scale change — these need updating to use integer values. Fix any broken tests by updating expected values.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/types/item.ts packages/engine/src/data/base-items.json packages/engine/src/data/affixes.json packages/engine/src/forge/stat-calculator.ts packages/engine/tests/
git commit -m "refactor: convert stat calculator and data to integer scale"
```

---

### Task 3: Refactor damage-calc.ts to return DamageBreakdown

**Files:**
- Modify: `packages/engine/src/duel/damage-calc.ts`
- Create: `packages/engine/src/types/damage-breakdown.ts`
- Test: `packages/engine/tests/damage-calc.test.ts` (update existing)

- [ ] **Step 1: Create DamageBreakdown types**

```typescript
// packages/engine/src/types/damage-breakdown.ts
import type { Element } from './derived-stats.js';

export interface PhysicalBreakdown {
  raw: number;
  armorPoints: number;
  armorPenetration: number;
  effectiveArmor: number;
  reductionPct: number;
  mitigated: number;
  net: number;
}

export interface ElementalBreakdown {
  raw: number;
  resistPoints: number;
  elementalPenetration: number;
  effectiveResist: number;
  reductionPct: number;
  mitigated: number;
  net: number;
}

export interface DamageBreakdown {
  dodged: boolean;
  physical: PhysicalBreakdown;
  elemental: Partial<Record<Element, ElementalBreakdown>>;
  blocked: number;
  barrierAbsorbed: number;
  totalRaw: number;
  totalMitigated: number;
  totalNet: number;
  isCrit: boolean;
  critMultiplier?: number;
  triggeredEffects?: Array<{ name: string; description: string }>;
}

export interface DotTickBreakdown {
  element: Element;
  damagePerTick: number;
  stacks: number;
  rawTotal: number;
  resistPoints: number;
  elementalPenetration: number;
  effectiveResist: number;
  reductionPct: number;
  netDamage: number;
}

export type HealSource = 'lifesteal' | 'regen' | 'hot' | 'burst';

export interface HealBreakdown {
  source: HealSource;
  rawHeal: number;
  effectiveHeal: number;
  overheal: number;
}
```

- [ ] **Step 2: Export from types index**

Add to `packages/engine/src/types/index.ts`:
```typescript
export type { DamageBreakdown, PhysicalBreakdown, ElementalBreakdown, DotTickBreakdown, HealBreakdown, HealSource } from './damage-breakdown.js';
```

- [ ] **Step 3: Write failing tests for new damage-calc API**

Update `packages/engine/tests/damage-calc.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateAttackBreakdown, calculateDOTBreakdown } from '../src/duel/damage-calc.js';
import { createEmptyDerivedStats } from '../src/types/derived-stats.js';

function makeStats(overrides: Partial<ReturnType<typeof createEmptyDerivedStats>> = {}) {
  return { ...createEmptyDerivedStats(), ...overrides };
}

describe('calculateAttackBreakdown', () => {
  it('returns full physical breakdown', () => {
    const attacker = makeStats({ physicalDamage: 40 });
    const defender = makeStats({ armor: 20 }); // 20 = 20% reduction
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.dodged).toBe(false);
    expect(bd.physical.raw).toBe(40);
    expect(bd.physical.armorPoints).toBe(20);
    expect(bd.physical.effectiveArmor).toBe(20);
    expect(bd.physical.reductionPct).toBe(20);
    expect(bd.physical.mitigated).toBe(8); // 40 * 0.20
    expect(bd.physical.net).toBe(32);
    expect(bd.totalRaw).toBe(40);
    expect(bd.totalNet).toBe(32);
  });

  it('applies armor penetration', () => {
    const attacker = makeStats({ physicalDamage: 40, armorPenetration: 10 });
    const defender = makeStats({ armor: 20 });
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.physical.effectiveArmor).toBe(10); // 20 - 10
    expect(bd.physical.reductionPct).toBe(10);
    expect(bd.physical.net).toBe(36); // 40 * 0.90
  });

  it('caps reduction at 90%', () => {
    const attacker = makeStats({ physicalDamage: 100 });
    const defender = makeStats({ armor: 95 });
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.physical.effectiveArmor).toBe(95);
    expect(bd.physical.reductionPct).toBe(90); // capped
    expect(bd.physical.net).toBe(10);
  });

  it('handles elemental damage with resistances', () => {
    const attacker = makeStats({
      physicalDamage: 0,
      elementalDamage: { ...createEmptyDerivedStats().elementalDamage, fire: 30 },
    });
    const defender = makeStats({
      resistances: { ...createEmptyDerivedStats().resistances, fire: 15 },
    });
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 0);

    expect(bd.elemental.fire).toBeDefined();
    expect(bd.elemental.fire!.raw).toBe(30);
    expect(bd.elemental.fire!.resistPoints).toBe(15);
    expect(bd.elemental.fire!.reductionPct).toBe(15);
    expect(bd.elemental.fire!.mitigated).toBe(5); // round(30 * 15/100) = 5
    expect(bd.elemental.fire!.net).toBe(25); // 30 - 5
    expect(bd.totalNet).toBe(25);
  });

  it('applies crit multiplier', () => {
    const attacker = makeStats({ physicalDamage: 40, critMultiplier: 200 }); // 200 = 2.0x
    const defender = makeStats({ armor: 0 });
    const bd = calculateAttackBreakdown(attacker, defender, true, false, 0);

    expect(bd.isCrit).toBe(true);
    expect(bd.critMultiplier).toBe(200);
    expect(bd.physical.raw).toBe(80); // 40 * 2.0
    expect(bd.totalNet).toBe(80);
  });

  it('returns dodged breakdown when dodged', () => {
    const attacker = makeStats({ physicalDamage: 40 });
    const defender = makeStats();
    const bd = calculateAttackBreakdown(attacker, defender, false, true, 0);

    expect(bd.dodged).toBe(true);
    expect(bd.totalNet).toBe(0);
  });

  it('applies block amount', () => {
    const attacker = makeStats({ physicalDamage: 40 });
    const defender = makeStats({ armor: 0, blockAmount: 15 });
    // blocked = true, blockAmount applied
    const bd = calculateAttackBreakdown(attacker, defender, false, false, 15);

    expect(bd.blocked).toBe(15);
    expect(bd.totalNet).toBe(25); // 40 - 15
  });
});

describe('calculateDOTBreakdown', () => {
  it('returns DOT tick breakdown with resistance', () => {
    const defender = makeStats({
      resistances: { ...createEmptyDerivedStats().resistances, fire: 10 },
      elementalPenetration: 0,
    });
    const bd = calculateDOTBreakdown('fire', 5, 2, defender, 0, 100);

    expect(bd.element).toBe('fire');
    expect(bd.damagePerTick).toBe(5);
    expect(bd.stacks).toBe(2);
    expect(bd.rawTotal).toBe(10); // 5 * 2
    expect(bd.resistPoints).toBe(10);
    expect(bd.effectiveResist).toBe(10);
    expect(bd.reductionPct).toBe(10);
    expect(bd.netDamage).toBe(9); // 10 * 0.90
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/damage-calc.test.ts`
Expected: FAIL — `calculateAttackBreakdown` and `calculateDOTBreakdown` don't exist

- [ ] **Step 5: Implement new damage-calc.ts**

Rewrite `packages/engine/src/duel/damage-calc.ts`:

```typescript
import type { DerivedStats, Element } from '../types/derived-stats.js';
import type { DamageBreakdown, PhysicalBreakdown, ElementalBreakdown, DotTickBreakdown } from '../types/damage-breakdown.js';
import { ALL_ELEMENTS } from '../types/derived-stats.js';

const MAX_REDUCTION_PCT = 90;

function calcPhysical(raw: number, armorPts: number, armorPen: number): PhysicalBreakdown {
  const effectiveArmor = Math.max(0, armorPts - armorPen);
  const reductionPct = Math.min(effectiveArmor, MAX_REDUCTION_PCT);
  const mitigated = Math.round(raw * reductionPct / 100);
  const net = Math.max(0, raw - mitigated);
  return { raw, armorPoints: armorPts, armorPenetration: armorPen, effectiveArmor, reductionPct, mitigated, net };
}

function calcElemental(raw: number, resistPts: number, elemPen: number): ElementalBreakdown {
  const effectiveResist = Math.max(0, resistPts - elemPen);
  const reductionPct = Math.min(effectiveResist, MAX_REDUCTION_PCT);
  const mitigated = Math.round(raw * reductionPct / 100);
  const net = Math.max(0, raw - mitigated);
  return { raw, resistPoints: resistPts, elementalPenetration: elemPen, effectiveResist, reductionPct, mitigated, net };
}

export function calculateAttackBreakdown(
  attacker: DerivedStats,
  defender: DerivedStats,
  isCrit: boolean,
  isDodged: boolean,
  blockAmount: number, // 0 if not blocked
): DamageBreakdown {
  if (isDodged) {
    return {
      dodged: true,
      physical: { raw: 0, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 0 },
      elemental: {},
      blocked: 0,
      barrierAbsorbed: 0,
      totalRaw: 0,
      totalMitigated: 0,
      totalNet: 0,
      isCrit: false,
    };
  }

  const critMult = isCrit ? attacker.critMultiplier / 100 : 1;
  const rawPhys = Math.round(attacker.physicalDamage * critMult);
  const physical = calcPhysical(rawPhys, defender.armor, attacker.armorPenetration);

  const elemental: Partial<Record<Element, ElementalBreakdown>> = {};
  for (const elem of ALL_ELEMENTS) {
    const baseElem = attacker.elementalDamage[elem];
    if (baseElem <= 0) continue;
    const rawElem = Math.round(baseElem * critMult);
    elemental[elem] = calcElemental(rawElem, defender.resistances[elem], attacker.elementalPenetration);
  }

  let totalRaw = rawPhys;
  let totalNet = physical.net;
  for (const eb of Object.values(elemental)) {
    totalRaw += eb.raw;
    totalNet += eb.net;
  }

  // Block
  const blocked = Math.min(blockAmount, totalNet);
  totalNet -= blocked;

  const totalMitigated = totalRaw - totalNet - blocked;

  return {
    dodged: false,
    physical,
    elemental,
    blocked,
    barrierAbsorbed: 0, // filled in by duel-engine after barrier check
    totalRaw,
    totalMitigated,
    totalNet,
    isCrit,
    critMultiplier: isCrit ? attacker.critMultiplier : undefined,
  };
}

export function calculateDOTBreakdown(
  element: Element,
  damagePerTick: number,
  stacks: number,
  defender: DerivedStats,
  attackerElemPen: number,
  attackerDotMultiplier: number, // integer: 100 = 1.0x
): DotTickBreakdown {
  const rawTotal = damagePerTick * stacks;
  const resistPts = defender.resistances[element];
  const effectiveResist = Math.max(0, resistPts - attackerElemPen);
  const reductionPct = Math.min(effectiveResist, MAX_REDUCTION_PCT);
  const afterResist = rawTotal * (1 - reductionPct / 100);
  const netDamage = Math.max(0, Math.round(afterResist * attackerDotMultiplier / 100));

  return {
    element,
    damagePerTick,
    stacks,
    rawTotal,
    resistPoints: resistPts,
    elementalPenetration: attackerElemPen,
    effectiveResist,
    reductionPct,
    netDamage,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/damage-calc.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/types/damage-breakdown.ts packages/engine/src/types/index.ts packages/engine/src/duel/damage-calc.ts packages/engine/tests/damage-calc.test.ts
git commit -m "feat: add DamageBreakdown types and refactor damage-calc"
```

---

### Task 4: Update TickEvent types with breakdown data

**Files:**
- Modify: `packages/engine/src/types/combat.ts`

- [ ] **Step 1: Update TickEvent attack type to carry DamageBreakdown**

In `packages/engine/src/types/combat.ts`, change the `attack` event variant:

```typescript
// Before:
// attack: { attacker: 0|1; damage: number; damageType: 'physical'|Element; isCrit: boolean }

// After:
attack: {
  type: 'attack';
  attacker: 0 | 1;
  breakdown: DamageBreakdown;
}
```

Add new event types:
```typescript
dot_tick: {
  type: 'dot_tick';
  target: 0 | 1;
  breakdown: DotTickBreakdown;
}

heal: {
  type: 'heal';
  player: 0 | 1;
  breakdown: HealBreakdown;
}
```

Keep existing `block`, `dodge`, `lifesteal`, `thorns`, `barrier_absorb` events for now — they'll be progressively replaced by data in the breakdowns. Mark them `@deprecated` with a comment.

- [ ] **Step 2: Export breakdown types from combat.ts**

Add imports at top of combat.ts:
```typescript
import type { DamageBreakdown, DotTickBreakdown, HealBreakdown } from './damage-breakdown.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types/combat.ts
git commit -m "feat: add breakdown data to TickEvent types"
```

---

### Task 5: Update duel-engine.ts to emit rich events

**Files:**
- Modify: `packages/engine/src/duel/duel-engine.ts`
- Test: `packages/engine/tests/duel.test.ts` (update existing)
- Test: `packages/engine/tests/duel-breakdown.test.ts` (new)

- [ ] **Step 1: Write integration test for breakdown events**

```typescript
// packages/engine/tests/duel-breakdown.test.ts
import { describe, it, expect } from 'vitest';
import { simulate } from '../src/duel/duel-engine.js';
import { createEmptyDerivedStats } from '../src/types/derived-stats.js';
import { createEmptyLoadout } from '../src/types/item.js';
import { SeededRNG } from '../src/utils/rng.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';

function makeStats(overrides = {}) {
  return { ...createEmptyDerivedStats(), maxHP: 200, ...overrides };
}

describe('duel engine breakdown events', () => {
  let registry: DataRegistry;

  beforeAll(() => {
    const data = loadAndValidateData();
    registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  });

  it('attack events carry DamageBreakdown', () => {
    const stats: [any, any] = [
      makeStats({ physicalDamage: 40, attackInterval: 30 }),
      makeStats({ physicalDamage: 30, attackInterval: 30, armor: 10 }),
    ];
    const loadouts = [createEmptyLoadout('sword', 'chainmail'), createEmptyLoadout('sword', 'chainmail')];
    const rng = new SeededRNG(42);
    const log = simulate(stats, loadouts, registry, rng, 1);

    const attackEvents = log.ticks.flatMap(t => t.events).filter(e => e.type === 'attack');
    expect(attackEvents.length).toBeGreaterThan(0);

    const first = attackEvents[0];
    expect(first.breakdown).toBeDefined();
    expect(first.breakdown.physical).toBeDefined();
    expect(first.breakdown.totalNet).toBeGreaterThan(0);
    expect(first.breakdown.physical.armorPoints).toBeDefined();
  });

  it('heal events carry HealBreakdown', () => {
    const stats: [any, any] = [
      makeStats({ physicalDamage: 40, attackInterval: 30, lifestealPercent: 20 }),
      makeStats({ physicalDamage: 10, attackInterval: 30 }),
    ];
    const loadouts = [createEmptyLoadout('sword', 'chainmail'), createEmptyLoadout('sword', 'chainmail')];
    const rng = new SeededRNG(42);
    const log = simulate(stats, loadouts, registry, rng, 1);

    const healEvents = log.ticks.flatMap(t => t.events).filter(e => e.type === 'heal');
    expect(healEvents.length).toBeGreaterThan(0);

    const heal = healEvents[0];
    expect(heal.breakdown.source).toBe('lifesteal');
    expect(heal.breakdown.effectiveHeal).toBeGreaterThan(0);
  });

  it('HP changes sum correctly from breakdowns', () => {
    const stats: [any, any] = [
      makeStats({ physicalDamage: 40, attackInterval: 30 }),
      makeStats({ physicalDamage: 30, attackInterval: 30, armor: 10 }),
    ];
    const loadouts = [createEmptyLoadout('sword', 'chainmail'), createEmptyLoadout('sword', 'chainmail')];
    const rng = new SeededRNG(42);
    const log = simulate(stats, loadouts, registry, rng, 1);

    // Verify final HP matches sum of all damage/heals
    const hpChangeEvents = log.ticks.flatMap(t => t.events).filter(e => e.type === 'hp_change');
    const lastP1HP = hpChangeEvents.filter(e => e.player === 1).at(-1);
    if (lastP1HP) {
      expect(lastP1HP.newHP).toBe(log.result.finalHP[1]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/duel-breakdown.test.ts`
Expected: FAIL — `breakdown` field doesn't exist on attack events

- [ ] **Step 3: Refactor duel-engine.ts attack resolution**

In `packages/engine/src/duel/duel-engine.ts`, update the attack processing section (around lines 113-342):

1. Import `calculateAttackBreakdown`, `calculateDOTBreakdown` from `./damage-calc.js`
2. Replace inline damage calculation with:
```typescript
const isDodged = rng.next() < defender.stats.dodgeChance / 100;
const isBlocked = !isDodged && rng.next() < Math.max(0, defender.stats.blockChance - attacker.stats.blockBreakChance) / 100;
const blockAmt = isBlocked ? defender.stats.blockAmount : 0;
const isCrit = !isDodged && rng.next() < Math.max(0, attacker.stats.critChance - defender.stats.critAvoidance) / 100;

const breakdown = calculateAttackBreakdown(attacker.stats, defender.stats, isCrit, isDodged, blockAmt);
```

3. Emit single `attack` event with the breakdown:
```typescript
log.addEvent(tick, { type: 'attack', attacker: attacker.playerId, breakdown });
```

4. Use `breakdown.totalNet` for HP damage application
5. Handle barrier absorption: if `defender.barrier > 0`, subtract from `breakdown.totalNet`, set `breakdown.barrierAbsorbed`
6. Replace lifesteal event with heal event:
```typescript
if (attacker.stats.lifestealPercent > 0 && damageToHP > 0) {
  const rawHeal = Math.round(damageToHP * attacker.stats.lifestealPercent / 100);
  const effectiveHeal = Math.min(rawHeal, attacker.maxHP - attacker.currentHP);
  const overheal = rawHeal - effectiveHeal;
  attacker.currentHP += effectiveHeal;
  log.addEvent(tick, {
    type: 'heal',
    player: attacker.playerId,
    breakdown: { source: 'lifesteal', rawHeal, effectiveHeal, overheal },
  });
}
```

7. Replace DOT tick section with `calculateDOTBreakdown`. Note: `dot.sourcePlayerId` tracks who applied the DOT — use that player's penetration/dotMultiplier:
```typescript
const dotSource = gladiators[dot.sourcePlayerId]; // the player who applied this DOT
const dotBd = calculateDOTBreakdown(
  dot.element, dot.damagePerTick, dot.stacks,
  gladiator.stats, dotSource.stats.elementalPenetration, dotSource.stats.dotMultiplier
);
log.addEvent(tick, { type: 'dot_tick', target: gladiator.playerId, breakdown: dotBd });
```

8. Replace HP regen with heal event:
```typescript
if (gladiator.stats.hpRegen > 0 && gladiator.currentHP < gladiator.maxHP && gladiator.currentHP > 0) {
  const rawHeal = gladiator.stats.hpRegen;
  const effectiveHeal = Math.min(rawHeal, gladiator.maxHP - gladiator.currentHP);
  const overheal = rawHeal - effectiveHeal;
  gladiator.currentHP += effectiveHeal;
  log.addEvent(tick, {
    type: 'heal',
    player: gladiator.playerId,
    breakdown: { source: 'regen', rawHeal, effectiveHeal, overheal },
  });
}
```

- [ ] **Step 4: Update existing duel tests for new event shape**

In `packages/engine/tests/duel.test.ts`, update event assertions:
- `event.damage` → `event.breakdown.totalNet`
- `event.damageType` → check `event.breakdown.physical.raw > 0` or `event.breakdown.elemental[elem]`
- `event.isCrit` → `event.breakdown.isCrit`

- [ ] **Step 5: Run all engine tests**

Run: `cd packages/engine && npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/duel/duel-engine.ts packages/engine/tests/
git commit -m "feat: emit rich DamageBreakdown events from duel engine"
```

---

### Task 6: Verify tools package still works (single source of truth)

**Files:**
- Check: `packages/tools/src/hooks/useSimulation.ts`
- Test: Run tools build + any tests

- [ ] **Step 1: Check tools package for compile errors**

Run: `cd packages/tools && npx tsc --noEmit`
Expected: May have errors if tools references old TickEvent shapes (e.g., `event.damage`). Fix any references.

- [ ] **Step 2: Search for divergent damage logic**

Run: `grep -r "calculatePhysicalDamage\|calculateElementalDamage\|armor \*\|resist \*" packages/tools/src/`
Expected: No hits — tools is already a pure consumer (confirmed by exploration). If any found, replace with engine imports.

- [ ] **Step 3: Fix any compile errors**

If tools references old event fields, update them to use the new breakdown structure.

- [ ] **Step 4: Run tools tests if they exist**

Run: `cd packages/tools && npx vitest run 2>/dev/null || echo "no tests"`

- [ ] **Step 5: Commit if changes needed**

```bash
git add packages/tools/
git commit -m "fix: update tools package for new event types"
```

---

## Chunk 2: Base Item Selection UI (Forge Phase)

### Task 7: Create BaseItemSelector component

**Files:**
- Create: `packages/client/src/features/forge/BaseItemSelector.tsx`
- Create: `packages/client/src/features/forge/BaseItemCard.tsx`
- Test: `packages/client/src/features/forge/__tests__/BaseItemSelector.test.tsx`

- [ ] **Step 1: Write component test**

```typescript
// packages/client/src/features/forge/__tests__/BaseItemSelector.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BaseItemSelector } from '../BaseItemSelector.js';

const mockWeapons = [
  { id: 'sword', type: 'weapon' as const, name: 'Sword', baseStats: { physicalDamage: 40, attackInterval: 54 }, description: 'Balanced' },
  { id: 'dagger', type: 'weapon' as const, name: 'Dagger', baseStats: { physicalDamage: 20, attackInterval: 30 }, description: 'Fast' },
];

describe('BaseItemSelector', () => {
  it('renders all items as cards', () => {
    const onSelect = vi.fn();
    render(<BaseItemSelector itemType="weapon" items={mockWeapons} onSelect={onSelect} />);
    expect(screen.getByText('Sword')).toBeTruthy();
    expect(screen.getByText('Dagger')).toBeTruthy();
  });

  it('calls onSelect when item clicked and confirmed', () => {
    const onSelect = vi.fn();
    render(<BaseItemSelector itemType="weapon" items={mockWeapons} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Sword'));
    fireEvent.click(screen.getByText(/confirm/i));
    expect(onSelect).toHaveBeenCalledWith(mockWeapons[0]);
  });

  it('has a random button', () => {
    const onSelect = vi.fn();
    render(<BaseItemSelector itemType="weapon" items={mockWeapons} onSelect={onSelect} />);
    const randomBtn = screen.getByText(/random/i);
    expect(randomBtn).toBeTruthy();
    fireEvent.click(randomBtn);
    expect(onSelect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/client && npx vitest run src/features/forge/__tests__/BaseItemSelector.test.tsx`
Expected: FAIL — component doesn't exist

- [ ] **Step 3: Implement BaseItemCard**

```typescript
// packages/client/src/features/forge/BaseItemCard.tsx
import type { BaseItemDef } from '@alloy/engine';

interface BaseItemCardProps {
  item: BaseItemDef;
  isSelected: boolean;
  onClick: () => void;
}

export function BaseItemCard({ item, isSelected, onClick }: BaseItemCardProps) {
  const isWeapon = item.type === 'weapon';
  const primaryStat = isWeapon
    ? `${item.baseStats.physicalDamage ?? 0} DMG`
    : `${item.baseStats.armor ?? 0} Armor`;
  const secondaryStat = isWeapon
    ? `${((item.baseStats.attackInterval ?? 30) / 30).toFixed(1)}s`
    : `+${item.baseStats.maxHP ?? 0} HP`;

  return (
    <button
      onClick={onClick}
      style={{
        background: isSelected ? 'rgba(59,130,246,0.15)' : 'rgba(30,41,59,0.5)',
        border: isSelected ? '2px solid #3b82f6' : '2px solid rgba(30,41,59,0.5)',
        borderRadius: 8,
        padding: '12px',
        cursor: 'pointer',
        textAlign: 'left',
        color: '#e2e8f0',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{item.description}</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 13 }}>
        <span style={{ color: '#60a5fa' }}>{primaryStat}</span>
        <span style={{ color: '#94a3b8' }}>{secondaryStat}</span>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Implement BaseItemSelector**

```typescript
// packages/client/src/features/forge/BaseItemSelector.tsx
import { useState } from 'react';
import type { BaseItemDef } from '@alloy/engine';
import { BaseItemCard } from './BaseItemCard.js';

interface BaseItemSelectorProps {
  itemType: 'weapon' | 'armor';
  items: BaseItemDef[];
  onSelect: (item: BaseItemDef) => void;
}

export function BaseItemSelector({ itemType, items, onSelect }: BaseItemSelectorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find(i => i.id === selectedId);

  const handleRandom = () => {
    const pick = items[Math.floor(Math.random() * items.length)];
    onSelect(pick);
  };

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ color: '#e2e8f0', fontSize: 18, marginBottom: 4 }}>
        Choose your {itemType}
      </h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
        Select a base {itemType} to forge with
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 8,
        marginBottom: 16,
      }}>
        {items.map(item => (
          <BaseItemCard
            key={item.id}
            item={item}
            isSelected={selectedId === item.id}
            onClick={() => setSelectedId(item.id)}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          style={{
            padding: '8px 24px',
            borderRadius: 6,
            background: selected ? '#3b82f6' : '#1e293b',
            color: '#fff',
            border: 'none',
            cursor: selected ? 'pointer' : 'default',
            opacity: selected ? 1 : 0.5,
            fontWeight: 600,
          }}
        >
          Confirm
        </button>
        <button
          onClick={handleRandom}
          style={{
            padding: '8px 24px',
            borderRadius: 6,
            background: 'rgba(30,41,59,0.5)',
            color: '#94a3b8',
            border: '1px solid #334155',
            cursor: 'pointer',
          }}
        >
          Random
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/client && npx vitest run src/features/forge/__tests__/BaseItemSelector.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/forge/BaseItemSelector.tsx packages/client/src/features/forge/BaseItemCard.tsx packages/client/src/features/forge/__tests__/BaseItemSelector.test.tsx
git commit -m "feat: add BaseItemSelector component for forge item selection"
```

---

### Task 8: Wire BaseItemSelector into Forge.tsx flow

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`
- Modify: `packages/client/src/stores/forgeStore.ts`

- [ ] **Step 1: Add item selection state to forgeStore**

In `packages/client/src/stores/forgeStore.ts`, add:
```typescript
// State
itemSelectionPhase: 'weapon' | 'armor' | 'done';
selectedWeaponId: string | null;
selectedArmorId: string | null;

// Actions
selectBaseItem: (itemType: 'weapon' | 'armor', itemId: string) => void;
```

The `selectBaseItem` action:
- Sets `selectedWeaponId` or `selectedArmorId`
- Advances `itemSelectionPhase`: weapon → armor → done
- When done, the existing `initPlan()` call in `Forge.tsx` uses `createEmptyLoadout(selectedWeaponId, selectedArmorId)` — the item IDs flow through the existing `Loadout.weapon.baseItemId` / `Loadout.armor.baseItemId` fields. No signature change needed on `initPlan`.

- [ ] **Step 2: Add item selection step to Forge.tsx**

At the top of Forge's render, before the existing forge UI:
```typescript
if (forgeStore.itemSelectionPhase !== 'done') {
  const itemType = forgeStore.itemSelectionPhase;
  const items = registry.getBaseItemsByType(itemType);
  return (
    <BaseItemSelector
      itemType={itemType}
      items={items}
      onSelect={(item) => forgeStore.selectBaseItem(itemType, item.id)}
    />
  );
}
// ...existing forge UI below
```

- [ ] **Step 3: Write test for forgeStore item selection flow**

```typescript
// In forgeStore test or a new test file
import { describe, it, expect } from 'vitest';
import { useForgeStore } from '../../stores/forgeStore.js';

describe('forgeStore item selection', () => {
  beforeEach(() => useForgeStore.getState().reset());

  it('starts in weapon selection phase', () => {
    expect(useForgeStore.getState().itemSelectionPhase).toBe('weapon');
  });

  it('advances weapon → armor → done', () => {
    useForgeStore.getState().selectBaseItem('weapon', 'sword');
    expect(useForgeStore.getState().itemSelectionPhase).toBe('armor');
    expect(useForgeStore.getState().selectedWeaponId).toBe('sword');

    useForgeStore.getState().selectBaseItem('armor', 'chainmail');
    expect(useForgeStore.getState().itemSelectionPhase).toBe('done');
    expect(useForgeStore.getState().selectedArmorId).toBe('chainmail');
  });
});
```

- [ ] **Step 4: Smoke test manually**

Run: `cd packages/client && npm run dev`
Navigate to a match, enter forge phase. Verify:
1. Weapon selection shows first
2. Selecting a weapon advances to armor selection
3. Selecting armor advances to the existing forge UI
4. "Random" button works for both

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Forge.tsx packages/client/src/stores/forgeStore.ts
git commit -m "feat: wire base item selection into forge phase flow"
```

---

### Task 9: AI item selection

**Files:**
- Create: `packages/engine/src/ai/item-selection.ts`
- Modify: `packages/engine/src/ai/ai-controller.ts`
- Test: `packages/engine/tests/ai-item-selection.test.ts`

- [ ] **Step 1: Write test for AI item selection**

```typescript
// packages/engine/tests/ai-item-selection.test.ts
import { describe, it, expect } from 'vitest';
import { selectAIItems } from '../src/ai/item-selection.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';

describe('selectAIItems', () => {
  let registry: DataRegistry;

  beforeAll(() => {
    const data = loadAndValidateData();
    registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  });

  it('easy tier returns random valid items', () => {
    const rng = new SeededRNG(42);
    const result = selectAIItems(1, [], registry, rng);
    expect(result.weapon.type).toBe('weapon');
    expect(result.armor.type).toBe('armor');
  });

  it('hard tier picks fire-resist armor against fire-heavy draft', () => {
    const rng = new SeededRNG(42);
    const fireGems = [{ tags: ['fire'] }, { tags: ['fire'] }, { tags: ['fire'] }];
    const result = selectAIItems(5, fireGems as any, registry, rng);
    // Should pick armor with highest fire resistance
    const allArmors = registry.getBaseItemsByType('armor');
    const maxFireResist = Math.max(...allArmors.map(a => a.baseStats.fireResistance ?? 0));
    expect(result.armor.baseStats.fireResistance ?? 0).toBe(maxFireResist);
  });

  it('deterministic with same seed', () => {
    const r1 = selectAIItems(1, [], registry, new SeededRNG(99));
    const r2 = selectAIItems(1, [], registry, new SeededRNG(99));
    expect(r1.weapon.id).toBe(r2.weapon.id);
    expect(r1.armor.id).toBe(r2.armor.id);
  });
});
```

- [ ] **Step 2: Implement selectAIItems**

```typescript
// packages/engine/src/ai/item-selection.ts
import type { BaseItemDef } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { AITier } from './ai-controller.js';

export function selectAIItems(
  tier: AITier, // 1-5, where 1=easy, 5=hard
  playerDraftedGems: Array<{ tags: string[] }>,
  registry: DataRegistry,
  rng: SeededRNG,
): { weapon: BaseItemDef; armor: BaseItemDef } {
  const weapons = registry.getBaseItemsByType('weapon');
  const armors = registry.getBaseItemsByType('armor');

  if (tier <= 2) { // Easy
    return {
      weapon: weapons[Math.floor(rng.next() * weapons.length)],
      armor: armors[Math.floor(rng.next() * armors.length)],
    };
  }

  if (tier <= 3) { // Medium — favor balanced items
    const midWeapon = [...weapons].sort((a, b) =>
      Math.abs((a.baseStats.attackInterval ?? 54) - 54) - Math.abs((b.baseStats.attackInterval ?? 54) - 54)
    )[0];
    const midArmor = [...armors].sort((a, b) =>
      Math.abs((a.baseStats.armor ?? 20) - 20) - Math.abs((b.baseStats.armor ?? 20) - 20)
    )[0];
    return { weapon: midWeapon, armor: midArmor };
  }

  // Tier 4-5 (Hard): counter-pick based on player's drafted gem elements
  const elementCounts: Record<string, number> = {};
  for (const gem of playerDraftedGems) {
    for (const tag of gem.tags) {
      if (['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos'].includes(tag)) {
        elementCounts[tag] = (elementCounts[tag] ?? 0) + 1;
      }
    }
  }
  const dominantElement = Object.entries(elementCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Pick armor with highest resistance to dominant element
  let bestArmor = armors[0];
  if (dominantElement) {
    const resistKey = `${dominantElement}Resistance`;
    bestArmor = armors.reduce((best, a) =>
      (a.baseStats[resistKey] ?? 0) > (best.baseStats[resistKey] ?? 0) ? a : best
    , armors[0]);
  }

  // Pick weapon with highest damage
  const bestWeapon = weapons.reduce((best, w) =>
    (w.baseStats.physicalDamage ?? 0) > (best.baseStats.physicalDamage ?? 0) ? w : best
  , weapons[0]);

  return { weapon: bestWeapon, armor: bestArmor };
}
```

- [ ] **Step 3: Run test**

Run: `cd packages/engine && npx vitest run tests/ai-item-selection.test.ts`
Expected: PASS

- [ ] **Step 4: Wire into AIController**

In `packages/engine/src/ai/ai-controller.ts`, add a method (matches existing pattern of receiving registry/rng as params):
```typescript
selectItems(playerDraftedGems: Array<{ tags: string[] }>, registry: DataRegistry, rng: SeededRNG): { weapon: BaseItemDef; armor: BaseItemDef } {
  return selectAIItems(this.tier, playerDraftedGems, registry, rng);
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ai/item-selection.ts packages/engine/src/ai/ai-controller.ts packages/engine/tests/ai-item-selection.test.ts
git commit -m "feat: add AI base item selection with difficulty-based strategy"
```

---

## Chunk 3: Combat UI Redesign

### Task 10: Define color palette constants

**Files:**
- Create: `packages/client/src/features/duel/colors.ts`

- [ ] **Step 1: Create damage type color constants**

```typescript
// packages/client/src/features/duel/colors.ts
import type { Element } from '@alloy/engine';

export const DAMAGE_COLORS: Record<Element | 'physical', number> = {
  physical: 0xe2e8f0,
  fire: 0xf97316,
  cold: 0x22d3ee,
  lightning: 0xfacc15,
  poison: 0x4ade80,
  shadow: 0xa855f7,
  chaos: 0xec4899,
};

export const DAMAGE_CSS_COLORS: Record<Element | 'physical', string> = {
  physical: '#e2e8f0',
  fire: '#f97316',
  cold: '#22d3ee',
  lightning: '#facc15',
  poison: '#4ade80',
  shadow: '#a855f7',
  chaos: '#ec4899',
};

export const UI_COLORS = {
  crit: '#fbbf24',
  critGlow: 'rgba(251,191,36,0.5)',
  healing: '#34d399',
  overheal: '#6b8f7b',
  blocked: '#94a3b8',
  dodged: '#60a5fa',
  playerHP: '#22c55e',
  enemyHP: '#ef4444',
  playerAccent: '#3b82f6',
  enemyAccent: '#ef4444',
  muted: '#64748b',
  separator: '#334155',
} as const;

export const PIXI_COLORS = {
  crit: 0xfbbf24,
  healing: 0x34d399,
  blocked: 0x94a3b8,
  dodged: 0x60a5fa,
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/features/duel/colors.ts
git commit -m "feat: add damage type color palette constants"
```

---

### Task 11: Build CombatLogPanel component

**Files:**
- Create: `packages/client/src/features/duel/CombatLogPanel.tsx`
- Create: `packages/client/src/features/duel/SwingGroup.tsx`
- Create: `packages/client/src/features/duel/combat-log-grouper.ts`
- Test: `packages/client/src/features/duel/__tests__/combat-log-grouper.test.ts`

- [ ] **Step 1: Write test for combat log grouping logic**

```typescript
// packages/client/src/features/duel/__tests__/combat-log-grouper.test.ts
import { describe, it, expect } from 'vitest';
import { groupEventsIntoSwings } from '../combat-log-grouper.js';
import type { TickEvent } from '@alloy/engine';

describe('groupEventsIntoSwings', () => {
  it('groups attack + heal into one swing group', () => {
    const events: Array<{ tick: number; event: TickEvent }> = [
      {
        tick: 30,
        event: {
          type: 'attack',
          attacker: 0,
          breakdown: {
            dodged: false,
            physical: { raw: 40, armorPoints: 10, armorPenetration: 0, effectiveArmor: 10, reductionPct: 10, mitigated: 4, net: 36 },
            elemental: {},
            blocked: 0, barrierAbsorbed: 0,
            totalRaw: 40, totalMitigated: 4, totalNet: 36,
            isCrit: false,
          },
        },
      },
      {
        tick: 30,
        event: {
          type: 'heal',
          player: 0,
          breakdown: { source: 'lifesteal', rawHeal: 8, effectiveHeal: 8, overheal: 0 },
        },
      },
      {
        tick: 30,
        event: { type: 'hp_change', player: 1, oldHP: 200, newHP: 164, maxHP: 200 },
      },
    ];

    const groups = groupEventsIntoSwings(events);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('attack');
    expect(groups[0].tick).toBe(30);
    expect(groups[0].events).toHaveLength(3);
  });

  it('separates DOT ticks into their own groups', () => {
    const events: Array<{ tick: number; event: TickEvent }> = [
      {
        tick: 60,
        event: {
          type: 'dot_tick',
          target: 1,
          breakdown: {
            element: 'fire', damagePerTick: 5, stacks: 2,
            rawTotal: 10, resistPoints: 0, elementalPenetration: 0,
            effectiveResist: 0, reductionPct: 0, netDamage: 10,
          },
        },
      },
      {
        tick: 90,
        event: {
          type: 'attack',
          attacker: 0,
          breakdown: {
            dodged: false,
            physical: { raw: 40, armorPoints: 0, armorPenetration: 0, effectiveArmor: 0, reductionPct: 0, mitigated: 0, net: 40 },
            elemental: {},
            blocked: 0, barrierAbsorbed: 0,
            totalRaw: 40, totalMitigated: 0, totalNet: 40,
            isCrit: false,
          },
        },
      },
    ];

    const groups = groupEventsIntoSwings(events);
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe('dot_tick');
    expect(groups[1].type).toBe('attack');
  });
});
```

- [ ] **Step 2: Implement combat-log-grouper.ts**

```typescript
// packages/client/src/features/duel/combat-log-grouper.ts
import type { TickEvent } from '@alloy/engine';

export interface SwingGroup {
  type: 'attack' | 'dot_tick' | 'heal' | 'death';
  tick: number;
  attacker?: 0 | 1;
  target?: 0 | 1;
  events: Array<{ tick: number; event: TickEvent }>;
}

export function groupEventsIntoSwings(
  flatEvents: Array<{ tick: number; event: TickEvent }>,
): SwingGroup[] {
  const groups: SwingGroup[] = [];
  let current: SwingGroup | null = null;

  for (const entry of flatEvents) {
    const { tick, event } = entry;

    if (event.type === 'attack') {
      // Start a new attack group
      if (current) groups.push(current);
      current = {
        type: 'attack',
        tick,
        attacker: event.attacker,
        events: [entry],
      };
    } else if (event.type === 'dot_tick') {
      // DOT ticks get their own group
      if (current) groups.push(current);
      current = {
        type: 'dot_tick',
        tick,
        target: event.target,
        events: [entry],
      };
    } else if (event.type === 'death') {
      if (current) groups.push(current);
      current = { type: 'death', tick, events: [entry] };
    } else if (event.type === 'heal' && (!current || current.tick !== tick)) {
      // Standalone heal (regen, not lifesteal)
      if (current) groups.push(current);
      current = { type: 'heal', tick, events: [entry] };
    } else if (current) {
      // Append to current group (lifesteal, hp_change, etc.)
      current.events.push(entry);
    } else {
      // Orphan event — create standalone group
      current = { type: 'heal', tick, events: [entry] };
    }
  }

  if (current) groups.push(current);
  return groups;
}
```

- [ ] **Step 3: Run grouper test**

Run: `cd packages/client && npx vitest run src/features/duel/__tests__/combat-log-grouper.test.ts`
Expected: PASS

- [ ] **Step 4: Implement SwingGroup component**

```typescript
// packages/client/src/features/duel/SwingGroup.tsx
interface SwingGroupProps {
  group: SwingGroup;         // from combat-log-grouper.ts
  ticksPerSecond: number;    // for timestamp conversion
}
```

Build `packages/client/src/features/duel/SwingGroup.tsx` — renders a single swing group with:
- Header: timestamp + attacker name + weapon info
- Damage pipeline rows per damage type (physical + each element with non-zero damage)
- Heal rows (lifesteal, regen)
- Summary footer (crit flag, total damage, resulting HP)
- All numbers color-coded using `DAMAGE_CSS_COLORS` and `UI_COLORS`
- Subtle background tint: red for enemy attacks, green for heals, element-colored for DOT ticks

- [ ] **Step 5: Implement CombatLogPanel component**

Build `packages/client/src/features/duel/CombatLogPanel.tsx`:
- Props: `{ events: Array<{ tick: number; event: TickEvent }>; ticksPerSecond: number }`
- Calls `groupEventsIntoSwings()` on the events
- Renders groups in reverse order (newest first)
- Scrollable container with auto-scroll behavior
- Combat Log header bar

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/duel/combat-log-grouper.ts packages/client/src/features/duel/SwingGroup.tsx packages/client/src/features/duel/CombatLogPanel.tsx packages/client/src/features/duel/__tests__/
git commit -m "feat: add per-swing grouped combat log panel"
```

---

### Task 12: Add cooldown ring to GladiatorSprite

**Files:**
- Create: `packages/client/src/features/duel/pixi/CooldownRing.ts`
- Modify: `packages/client/src/features/duel/pixi/GladiatorSprite.ts`

- [ ] **Step 1: Create CooldownRing class**

```typescript
// packages/client/src/features/duel/pixi/CooldownRing.ts
import { Graphics, Container, Text, TextStyle } from 'pixi.js';

export class CooldownRing {
  readonly container: Container;
  private bgRing: Graphics;
  private fgArc: Graphics;
  private label: Text;
  private radius: number;
  private color: number;
  private progress = 0;
  private pulseScale = 1;
  private pulseFrames = 0;

  constructor(radius: number, color: number, weaponName: string, attackSpeedSec: number) {
    this.radius = radius;
    this.color = color;
    this.container = new Container();

    // Background ring (20% opacity)
    this.bgRing = new Graphics();
    this.bgRing.lineStyle(3, color, 0.2);
    this.bgRing.arc(0, 0, radius, 0, Math.PI * 2);
    this.container.addChild(this.bgRing);

    // Foreground arc (fills clockwise)
    this.fgArc = new Graphics();
    this.container.addChild(this.fgArc);

    // Weapon label below
    this.label = new Text(`${attackSpeedSec.toFixed(1)}s ${weaponName}`, new TextStyle({
      fontSize: 9,
      fill: color,
      fontFamily: 'sans-serif',
    }));
    this.label.anchor.set(0.5, 0);
    this.label.y = radius + 8;
    this.container.addChild(this.label);
  }

  setProgress(progress: number) {
    this.progress = Math.max(0, Math.min(1, progress));
  }

  triggerPulse() {
    this.pulseFrames = 6;
  }

  update(dt: number) {
    // Draw foreground arc
    this.fgArc.clear();
    if (this.progress > 0) {
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + Math.PI * 2 * this.progress;
      this.fgArc.lineStyle(3, this.color, 1);
      this.fgArc.arc(0, 0, this.radius, startAngle, endAngle);
    }

    // Pulse animation
    if (this.pulseFrames > 0) {
      this.pulseFrames -= dt;
      const t = this.pulseFrames / 6;
      this.pulseScale = 1 + 0.15 * Math.sin(t * Math.PI);
      this.container.scale.set(this.pulseScale);
    } else {
      this.container.scale.set(1);
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 2: Integrate into GladiatorSprite**

In `packages/client/src/features/duel/pixi/GladiatorSprite.ts`:
- Import `CooldownRing`
- Add `cooldownRing: CooldownRing` field
- Add new constructor parameters: `weaponName: string`, `attackSpeedSec: number`
- In constructor, create ring with radius ~40, color (blue `0x3b82f6` for P0, red `0xef4444` for P1), weapon name and speed
- In `update()`, call `cooldownRing.update(dt)`
- Add `setCooldownProgress(progress: number)` method
- Add `triggerAttackPulse()` method that calls `cooldownRing.triggerPulse()`

- [ ] **Step 3: Wire cooldown progress in DuelRenderer**

In `packages/client/src/components/DuelRenderer.tsx` (the active renderer):
- Track `attackTimer` per gladiator: `currentTick % attackInterval / attackInterval`
- Call `gladiator.setCooldownProgress(progress)` each frame
- On attack event, call `gladiator.triggerAttackPulse()`

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/duel/pixi/CooldownRing.ts packages/client/src/features/duel/pixi/GladiatorSprite.ts
git commit -m "feat: add cooldown ring indicator to gladiator sprites"
```

---

### Task 13: Update floating damage numbers with color palette

**Files:**
- Modify: `packages/client/src/features/duel/pixi/DamageNumbers.ts`

- [ ] **Step 1: Update DamageNumbers to use breakdown data**

In `packages/client/src/features/duel/pixi/DamageNumbers.ts`:

- Import `DAMAGE_COLORS`, `PIXI_COLORS` from `../colors.js`
- Add new spawn method: `spawnFromBreakdown(breakdown: DamageBreakdown, targetX: number, targetY: number)`
  - Spawns multiple numbers for each damage type with non-zero net
  - Physical: white, standard size
  - Each element: element color
  - Crit: largest number is gold, 28px, bold, glow effect
  - Numbers cascade vertically (y offset +20px per number)
  - Largest/most important number on top
- Add `spawnHeal(amount: number, x: number, y: number, isOverheal: boolean)`
  - Green for effective heal, dimmed for overheal
- Add `spawnDodge(x: number, y: number)` — blue "DODGE" text
- Add `spawnBlock(amount: number, x: number, y: number)` — grey "BLOCK" text
- Update crit style: 28px (was 18px), add text shadow for glow

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/features/duel/pixi/DamageNumbers.ts
git commit -m "feat: update floating damage numbers with element colors and breakdown cascade"
```

---

### Task 14: Update StatusIcons for element-colored borders

**Files:**
- Modify: `packages/client/src/features/duel/pixi/StatusIcons.ts`

- [ ] **Step 1: Update StatusIcons to use DAMAGE_COLORS**

In `packages/client/src/features/duel/pixi/StatusIcons.ts`:
- Import `DAMAGE_COLORS` from `../colors.js`
- Update element icon colors to use the new palette (e.g., fire icons use `DAMAGE_COLORS.fire`)
- Ensure DOT status icons use element-specific border colors
- Buff/debuff icons already have green/red — keep those

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/features/duel/pixi/StatusIcons.ts
git commit -m "feat: update status icons with element-specific colors"
```

---

### Task 15: Redesign Duel.tsx layout

**Files:**
- Modify: `packages/client/src/pages/Duel.tsx`

- [ ] **Step 1: Restructure layout for 50/40/5/5 split**

Refactor `Duel.tsx` layout:

```typescript
// Top bar (~5%): compact single row
<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: 'rgba(15,23,42,0.8)' }}>
  {/* Round pips */}
  {/* Enemy HP slim bar */}
  {/* Timer */}
</div>

// Arena (~50%): PixiJS canvas
<div style={{ flex: '5 0 0', position: 'relative', minHeight: 0 }}>
  {/* DuelRenderer canvas */}
  {/* Playback controls (small overlay) */}
</div>

// Player HP bar (~5%)
<div style={{ padding: '4px 12px', background: 'rgba(15,23,42,0.8)' }}>
  {/* Slim HP bar */}
</div>

// Combat Log (~40%)
<div style={{ flex: '4 0 0', minHeight: 0, overflow: 'hidden' }}>
  <CombatLogPanel events={visibleEvents} ticksPerSecond={30} />
</div>
```

- [ ] **Step 2: Replace EventLog with CombatLogPanel**

Remove the old `EventLog` component and `formatEvent` function. Replace with `CombatLogPanel` import.

- [ ] **Step 3: Update event processing to use new attack event shape**

Update HP calculation logic to use `breakdown.totalNet` instead of `event.damage`. Update the `visibleEvents` filtering to work with the new event types.

- [ ] **Step 4: Update DuelRenderer event processing**

In `DuelRenderer.tsx`, update the event processing (around lines 280-364):
- On `attack` event: check `event.breakdown.dodged` — if true, call `damageNumbers.spawnDodge()`. Otherwise call `damageNumbers.spawnFromBreakdown(event.breakdown, targetX, targetY)`.
- On `heal` event: call `damageNumbers.spawnHeal()`
- Trigger VFX based on which elements have non-zero damage in the breakdown
- Trigger cooldown ring pulse on attack

- [ ] **Step 5: Smoke test the full flow**

Run: `cd packages/client && npm run dev`
Play through a full match. Verify:
1. Compact top/bottom HP bars
2. Large arena with cooldown rings
3. Color-coded floating damage text cascading
4. Per-swing combat log below
5. Crits are big and gold
6. DOT ticks are grouped correctly
7. Heals show in green

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/Duel.tsx packages/client/src/components/DuelRenderer.tsx
git commit -m "feat: redesign duel screen with 50/40 arena/log split and rich combat events"
```

---

### Task 16: Final integration test and polish

**Files:**
- Test: `packages/engine/tests/` (run all)
- Test: `packages/client/` (run all)

- [ ] **Step 1: Run full engine test suite**

Run: `cd packages/engine && npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run full client test suite**

Run: `cd packages/client && npx vitest run`
Expected: ALL PASS (fix any breakages from event shape changes)

- [ ] **Step 3: Run TypeScript check across monorepo**

Run: `npx tsc --build --noEmit`
Expected: No errors

- [ ] **Step 4: Manual end-to-end test**

Play through a complete match:
1. Draft phase (unchanged)
2. Forge: weapon selection → armor selection → gem socketing
3. Duel: observe cooldown rings, floating damage text, combat log
4. Verify AI also has items selected
5. Play all 3 rounds

- [ ] **Step 5: Final commit**

```bash
# Stage only the files changed in this task — review before staging
git add packages/engine/ packages/client/
git commit -m "chore: fix remaining integration issues from combat redesign"
```
