# Forge Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the forge screen with WoW-style item cards, drag-and-drop, combination workbench, GemCard stockpile, and engine-level ForgePlan for flexible placement until commit.

**Architecture:** New `ForgePlan` engine layer accumulates tentative actions (assign/remove freely, combine permanently) and replays them via `matchStore.dispatch` on commit. UI rewrite replaces tabbed OrbIcon layout with side-by-side WoW-style item tooltip cards + GemCard stockpile + drag-and-drop + confirmation modal.

**Tech Stack:** TypeScript, React 19, Zustand 5, Tailwind CSS 4, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-16-forge-redesign-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `packages/engine/src/forge/forge-plan.ts` | ForgePlan: create, applyPlanAction, commitPlan, getPlannedStats, canRemoveOrb |
| `packages/engine/tests/forge-plan.test.ts` | Unit tests for ForgePlan |
| `packages/client/src/shared/utils/stat-label.ts` | Extracted `getStatLabel(affix, orb, target)` |
| `packages/client/src/shared/utils/affix-order.ts` | `AFFIX_DISPLAY_ORDER` constant + `sortAffixesByDisplayOrder()` |
| `packages/client/src/shared/utils/element-theme.ts` | Consolidated `ELEMENT_COLORS`, `ELEMENT_GRADIENTS`, `TIER_COLORS`, `ELEMENT_EMOJIS` |
| `packages/client/src/pages/__tests__/Forge.test.tsx` | Component tests for Forge page |
| `packages/client/e2e/forge-redesign.spec.ts` | Playwright E2E tests |

### Modified files
| File | Change |
|------|--------|
| `packages/engine/src/index.ts` | Add ForgePlan exports |
| `packages/client/src/pages/Forge.tsx` | Full rewrite |
| `packages/client/src/stores/forgeStore.ts` | Rewrite: plan-based state |
| `packages/client/src/stores/forgeStore.test.ts` | Rewrite for new store shape |
| `packages/client/src/components/GemCard.tsx` | Add tier visual indicator |
| `packages/client/src/pages/Draft.tsx` | Import getStatLabel from shared |
| `packages/client/src/index.css` | Add flux-pop keyframe |
| `packages/client/e2e/fixtures/match.ts` | Update completeForge + placeOrbs helpers |
| `packages/client/e2e/match-flow.spec.ts` | Update forge screenshots |
| `docs/HANDOFF.md` | Add ForgePlan architecture section |

---

## Chunk 1: Engine — ForgePlan System

### Task 1: Create ForgePlan types and `createForgePlan`

**Files:**
- Create: `packages/engine/src/forge/forge-plan.ts`
- Create: `packages/engine/tests/forge-plan.test.ts`

- [ ] **Step 1: Write failing tests for createForgePlan**

In `packages/engine/tests/forge-plan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createForgePlan } from '../src/forge/forge-plan.js';
import { createForgeState } from '../src/forge/forge-state.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import type { OrbInstance } from '../src/types/orb.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

function makeMockOrbs(): OrbInstance[] {
  return [
    { uid: 'orb1', affixId: 'fire_damage', tier: 1 },
    { uid: 'orb2', affixId: 'cold_damage', tier: 1 },
    { uid: 'orb3', affixId: 'flat_hp', tier: 2 },
    { uid: 'orb4', affixId: 'armor_rating', tier: 1 },
    { uid: 'orb5', affixId: 'chance_on_hit', tier: 1 },
    { uid: 'orb6', affixId: 'lifesteal', tier: 2 },
    { uid: 'orb7', affixId: 'fire_damage', tier: 2 },
  ];
}

function makeForgeState(round: 1 | 2 | 3 = 1) {
  return createForgeState(makeMockOrbs(), 'iron_sword', 'iron_armor', round, data.balance, false);
}

describe('ForgePlan', () => {
  describe('createForgePlan', () => {
    it('snapshots stockpile, loadout, and flux', () => {
      const state = makeForgeState();
      const plan = createForgePlan(state, registry);
      expect(plan.stockpile).toHaveLength(state.stockpile.length);
      expect(plan.tentativeFlux).toBe(state.fluxRemaining);
      expect(plan.round).toBe(1);
      expect(plan.lockedOrbUids.size).toBe(0);
      expect(plan.permanentCombines).toHaveLength(0);
      expect(plan.actionLog).toHaveLength(0);
    });

    it('deep clones — mutations to plan do not affect original state', () => {
      const state = makeForgeState();
      const originalStockpileLength = state.stockpile.length;
      const plan = createForgePlan(state, registry);
      plan.stockpile.push({ uid: 'extra', affixId: 'thorns', tier: 1 });
      expect(state.stockpile).toHaveLength(originalStockpileLength);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/forge-plan.test.ts`
Expected: FAIL — `createForgePlan` not found

- [ ] **Step 3: Implement createForgePlan**

In `packages/engine/src/forge/forge-plan.ts`:

```typescript
import type { ForgeState } from './forge-state.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { OrbInstance } from '../types/orb.js';
import type { Loadout, EquippedSlot, ForgedItem } from '../types/item.js';
import type { DataRegistry } from '../data/registry.js';
import type { DerivedStats } from '../types/derived-stats.js';
import { calculateStats } from './stat-calculator.js';
import { getActionCost } from './flux-tracker.js';

export interface ForgePlan {
  stockpile: OrbInstance[];
  loadout: Loadout;
  tentativeFlux: number;
  maxFlux: number;
  round: 1 | 2 | 3;
  lockedOrbUids: Set<string>;
  permanentCombines: Array<{ compoundId: string; orbs: [OrbInstance, OrbInstance] }>;
  actionLog: ForgeAction[];
}

function deepCloneItem(item: ForgedItem): ForgedItem {
  return {
    baseItemId: item.baseItemId,
    baseStats: item.baseStats ? { ...item.baseStats } : null,
    slots: item.slots.map(s => {
      if (!s) return null;
      if (s.kind === 'single') return { kind: 'single' as const, orb: { ...s.orb } };
      if (s.kind === 'upgraded') return { kind: 'upgraded' as const, orb: { ...s.orb }, originalTier: s.originalTier, upgradedTier: s.upgradedTier };
      return { kind: 'compound' as const, orbs: [{ ...s.orbs[0] }, { ...s.orbs[1] }] as [OrbInstance, OrbInstance], compoundId: s.compoundId };
    }),
  };
}

export function createForgePlan(state: ForgeState, registry: DataRegistry): ForgePlan {
  return {
    stockpile: state.stockpile.map(o => ({ ...o })),
    loadout: {
      weapon: deepCloneItem(state.loadout.weapon),
      armor: deepCloneItem(state.loadout.armor),
    },
    tentativeFlux: state.fluxRemaining,
    maxFlux: state.fluxRemaining,
    round: state.round,
    lockedOrbUids: new Set(),
    permanentCombines: [],
    actionLog: [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/forge-plan.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts packages/engine/tests/forge-plan.test.ts
git commit -m "feat(engine): add ForgePlan type and createForgePlan with deep clone"
```

---

### Task 2: Implement `applyPlanAction` — assign_orb and remove_orb

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts`
- Modify: `packages/engine/tests/forge-plan.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `forge-plan.test.ts` inside the `ForgePlan` describe block:

```typescript
import { applyPlanAction } from '../src/forge/forge-plan.js';

describe('applyPlanAction — assign_orb', () => {
  it('moves orb from stockpile to loadout and decrements flux', () => {
    const state = makeForgeState();
    const plan = createForgePlan(state, registry);
    const startFlux = plan.tentativeFlux;
    const result = applyPlanAction(plan, {
      kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.tentativeFlux).toBe(startFlux - data.balance.fluxCosts.assignOrb);
    expect(result.plan.stockpile.find(o => o.uid === 'orb1')).toBeUndefined();
    expect(result.plan.loadout.weapon.slots[0]).not.toBeNull();
    expect(result.plan.actionLog).toHaveLength(1);
  });

  it('fails when no flux remaining', () => {
    const state = makeForgeState();
    const plan = createForgePlan(state, registry);
    plan.tentativeFlux = 0;
    const result = applyPlanAction(plan, {
      kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(result.ok).toBe(false);
  });
});

describe('applyPlanAction — remove_orb', () => {
  it('moves orb back to stockpile and costs flux (remove has a cost)', () => {
    const state = makeForgeState(2); // round 2 allows remove
    const plan = createForgePlan(state, registry);
    // First assign, then remove
    const r1 = applyPlanAction(plan, {
      kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const fluxAfterAssign = r1.plan.tentativeFlux;
    const r2 = applyPlanAction(r1.plan, {
      kind: 'remove_orb', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    // Remove costs flux (balance.fluxCosts.removeOrb = 1), same as the engine
    expect(r2.plan.tentativeFlux).toBe(fluxAfterAssign - data.balance.fluxCosts.removeOrb);
    expect(r2.plan.stockpile.find(o => o.uid === 'orb1')).toBeDefined();
  });

  it('is blocked in round 1', () => {
    const state = makeForgeState(1);
    const plan = createForgePlan(state, registry);
    const r1 = applyPlanAction(plan, {
      kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = applyPlanAction(r1.plan, {
      kind: 'remove_orb', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(r2.ok).toBe(false);
  });

  it('is allowed in round 2', () => {
    const state = makeForgeState(2);
    const plan = createForgePlan(state, registry);
    const r1 = applyPlanAction(plan, {
      kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = applyPlanAction(r1.plan, {
      kind: 'remove_orb', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(r2.ok).toBe(true);
  });

  it('cannot remove a locked orb', () => {
    // Will be testable after combine is implemented — placeholder
  });
});

describe('applyPlanAction — set_base_stats', () => {
  it('is reversible — can change stats multiple times', () => {
    const state = makeForgeState(1);
    const plan = createForgePlan(state, registry);
    let r = applyPlanAction(plan, {
      kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'VIT',
    }, registry);
    expect(r.ok).toBe(true); if (!r.ok) return;
    r = applyPlanAction(r.plan, {
      kind: 'set_base_stats', target: 'weapon', stat1: 'INT', stat2: 'DEX',
    }, registry);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.plan.loadout.weapon.baseStats?.stat1).toBe('INT');
    expect(r.plan.loadout.weapon.baseStats?.stat2).toBe('DEX');
  });

  it('is blocked in round 2+', () => {
    const state = makeForgeState(2);
    const plan = createForgePlan(state, registry);
    const r = applyPlanAction(plan, {
      kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'VIT',
    }, registry);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/forge-plan.test.ts`
Expected: FAIL — `applyPlanAction` not found

- [ ] **Step 3: Implement applyPlanAction for assign_orb and remove_orb**

Add to `packages/engine/src/forge/forge-plan.ts`:

```typescript
export type PlanResult = { ok: true; plan: ForgePlan } | { ok: false; error: string };

export function applyPlanAction(
  plan: ForgePlan,
  action: ForgeAction,
  registry: DataRegistry,
): PlanResult {
  const balance = registry.getBalance();
  const cost = getActionCost(action, balance);

  switch (action.kind) {
    case 'assign_orb': return planAssignOrb(plan, action, cost);
    case 'remove_orb': return planRemoveOrb(plan, action, cost);
    case 'set_base_stats': return planSetBaseStats(plan, action);
    default: return { ok: false, error: `Unsupported plan action: ${action.kind}` };
  }
}

function clonePlan(plan: ForgePlan): ForgePlan {
  return {
    stockpile: plan.stockpile.map(o => ({ ...o })),
    loadout: {
      weapon: deepCloneItem(plan.loadout.weapon),
      armor: deepCloneItem(plan.loadout.armor),
    },
    tentativeFlux: plan.tentativeFlux,
    maxFlux: plan.maxFlux,
    round: plan.round,
    lockedOrbUids: new Set(plan.lockedOrbUids),
    permanentCombines: [...plan.permanentCombines],
    actionLog: [...plan.actionLog],
  };
}

function planAssignOrb(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'assign_orb' }>,
  cost: number,
): PlanResult {
  if (plan.tentativeFlux < cost) return { ok: false, error: 'Not enough flux' };

  const orbIndex = plan.stockpile.findIndex(o => o.uid === action.orbUid);
  if (orbIndex === -1) return { ok: false, error: 'Orb not in stockpile' };

  const item = plan.loadout[action.target];
  if (action.slotIndex < 0 || action.slotIndex >= item.slots.length) {
    return { ok: false, error: 'Invalid slot index' };
  }
  if (item.slots[action.slotIndex] !== null) {
    return { ok: false, error: 'Slot already occupied' };
  }

  const next = clonePlan(plan);
  const orb = next.stockpile.splice(orbIndex, 1)[0];
  next.loadout[action.target].slots[action.slotIndex] = { kind: 'single', orb };
  next.tentativeFlux -= cost;
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planRemoveOrb(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'remove_orb' }>,
  cost: number,
): PlanResult {
  if (plan.round === 1) return { ok: false, error: 'Remove is not available in Round 1' };
  if (plan.tentativeFlux < cost) return { ok: false, error: 'Not enough flux' };

  const item = plan.loadout[action.target];
  const slot = item.slots[action.slotIndex];
  if (!slot) return { ok: false, error: 'Slot is empty' };

  // Check locked orbs
  const orbUids = slot.kind === 'compound' ? slot.orbs.map(o => o.uid) : [slot.kind === 'single' ? slot.orb.uid : slot.orb.uid];
  for (const uid of orbUids) {
    if (plan.lockedOrbUids.has(uid)) {
      return { ok: false, error: 'Cannot remove a locked orb (part of a permanent combine)' };
    }
  }

  const next = clonePlan(plan);
  const removedSlot = next.loadout[action.target].slots[action.slotIndex]!;
  next.loadout[action.target].slots[action.slotIndex] = null;

  // Return orb(s) to stockpile
  if (removedSlot.kind === 'single') next.stockpile.push(removedSlot.orb);
  else if (removedSlot.kind === 'upgraded') next.stockpile.push(removedSlot.orb);
  else if (removedSlot.kind === 'compound') removedSlot.orbs.forEach(o => next.stockpile.push(o));

  // Remove costs flux (same as engine — balance.fluxCosts.removeOrb)
  next.tentativeFlux -= cost;
  next.actionLog.push(action);
  return { ok: true, plan: next };
}

function planSetBaseStats(
  plan: ForgePlan,
  action: Extract<ForgeAction, { kind: 'set_base_stats' }>,
): PlanResult {
  if (plan.round !== 1) return { ok: false, error: 'Base stats can only be set in Round 1' };

  const next = clonePlan(plan);
  next.loadout[action.target].baseStats = { stat1: action.stat1, stat2: action.stat2 };
  next.actionLog.push(action);
  return { ok: true, plan: next };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/forge-plan.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts packages/engine/tests/forge-plan.test.ts
git commit -m "feat(engine): implement applyPlanAction for assign_orb, remove_orb, set_base_stats"
```

---

### Task 3: Implement `applyPlanAction` — combine and upgrade_tier

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts`
- Modify: `packages/engine/tests/forge-plan.test.ts`

- [ ] **Step 1: Write failing tests for combine and upgrade_tier**

Append to `forge-plan.test.ts`:

```typescript
describe('applyPlanAction — combine', () => {
  it('creates compound from stockpile orbs, locks both, costs flux', () => {
    const state = makeForgeState();
    const plan = createForgePlan(state, registry);
    const fluxBefore = plan.tentativeFlux;
    // Combine fire_damage + chance_on_hit directly from stockpile (same as engine)
    const r = applyPlanAction(plan, {
      kind: 'combine', orbUid1: 'orb1', orbUid2: 'orb5', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.plan.tentativeFlux).toBe(fluxBefore - data.balance.fluxCosts.combineOrbs);
    expect(r.plan.lockedOrbUids.has('orb1')).toBe(true);
    expect(r.plan.lockedOrbUids.has('orb5')).toBe(true);
    expect(r.plan.permanentCombines).toHaveLength(1);
    // Both orbs removed from stockpile
    expect(r.plan.stockpile.find(o => o.uid === 'orb1')).toBeUndefined();
    expect(r.plan.stockpile.find(o => o.uid === 'orb5')).toBeUndefined();
    // Compound placed in slot
    expect(r.plan.loadout.weapon.slots[0]?.kind).toBe('compound');
  });
});

describe('applyPlanAction — upgrade_tier', () => {
  it('fuses same-affix orbs and locks them', () => {
    const state = makeForgeState();
    let plan = createForgePlan(state, registry);
    // orb1 = fire_damage T1, orb7 = fire_damage T2
    const fluxBefore = plan.tentativeFlux;
    const r = applyPlanAction(plan, {
      kind: 'upgrade_tier', orbUid1: 'orb1', orbUid2: 'orb7', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.plan.tentativeFlux).toBe(fluxBefore - data.balance.fluxCosts.upgradeTier);
    expect(r.plan.lockedOrbUids.has('orb1')).toBe(true);
    expect(r.plan.lockedOrbUids.has('orb7')).toBe(true);
    const slot = r.plan.loadout.weapon.slots[0];
    expect(slot?.kind).toBe('upgraded');
  });

  it('cannot remove upgraded orb', () => {
    const state = makeForgeState(2); // round 2 allows remove
    let plan = createForgePlan(state, registry);
    let r = applyPlanAction(plan, {
      kind: 'upgrade_tier', orbUid1: 'orb1', orbUid2: 'orb7', target: 'weapon', slotIndex: 0,
    }, registry);
    expect(r.ok).toBe(true); if (!r.ok) return;
    const r2 = applyPlanAction(r.plan, { kind: 'remove_orb', target: 'weapon', slotIndex: 0 }, registry);
    expect(r2.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run tests/forge-plan.test.ts`
Expected: FAIL — combine/upgrade_tier not handled

- [ ] **Step 3: Implement combine and upgrade_tier in applyPlanAction**

Add cases to the switch in `applyPlanAction` and add the handler functions in `forge-plan.ts`. Follow the same patterns as `forge-state.ts` lines 104-253 but operating on the plan copy instead. Add `'combine'` and `'upgrade_tier'` cases to the switch. Both must add orb UIDs to `lockedOrbUids` and log to `actionLog`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/forge-plan.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts packages/engine/tests/forge-plan.test.ts
git commit -m "feat(engine): implement combine and upgrade_tier in ForgePlan"
```

---

### Task 4: Implement `commitPlan`, `getPlannedStats`, `canRemoveOrb` + exports

**Files:**
- Modify: `packages/engine/src/forge/forge-plan.ts`
- Modify: `packages/engine/tests/forge-plan.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Write failing tests**

Append to `forge-plan.test.ts`:

```typescript
import { commitPlan, getPlannedStats, canRemoveOrb } from '../src/forge/forge-plan.js';

describe('commitPlan', () => {
  it('produces correct ForgeAction replay log', () => {
    const state = makeForgeState();
    let plan = createForgePlan(state, registry);
    let r = applyPlanAction(plan, { kind: 'assign_orb', orbUid: 'orb1', target: 'weapon', slotIndex: 0 }, registry);
    expect(r.ok).toBe(true); if (!r.ok) return;
    r = applyPlanAction(r.plan, { kind: 'assign_orb', orbUid: 'orb3', target: 'armor', slotIndex: 0 }, registry);
    expect(r.ok).toBe(true); if (!r.ok) return;
    const actions = commitPlan(r.plan);
    expect(actions).toHaveLength(2);
    expect(actions[0].kind).toBe('assign_orb');
    expect(actions[1].kind).toBe('assign_orb');
  });
});

describe('getPlannedStats', () => {
  it('returns DerivedStats from plan loadout', () => {
    const state = makeForgeState();
    const plan = createForgePlan(state, registry);
    const stats = getPlannedStats(plan, registry);
    expect(stats.maxHP).toBeGreaterThan(0);
    expect(typeof stats.physicalDamage).toBe('number');
  });
});

describe('canRemoveOrb', () => {
  it('returns true for unlocked orbs', () => {
    const plan = createForgePlan(makeForgeState(), registry);
    expect(canRemoveOrb(plan, 'orb1')).toBe(true);
  });

  it('returns false for locked orbs', () => {
    const plan = createForgePlan(makeForgeState(), registry);
    plan.lockedOrbUids.add('orb1');
    expect(canRemoveOrb(plan, 'orb1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement commitPlan, getPlannedStats, canRemoveOrb**

In `forge-plan.ts`:

```typescript
export function commitPlan(plan: ForgePlan): ForgeAction[] {
  return [...plan.actionLog];
}

export function getPlannedStats(plan: ForgePlan, registry: DataRegistry): DerivedStats {
  return calculateStats(plan.loadout, registry);
}

export function canRemoveOrb(plan: ForgePlan, orbUid: string): boolean {
  return !plan.lockedOrbUids.has(orbUid);
}
```

- [ ] **Step 4: Add exports to engine index.ts**

In `packages/engine/src/index.ts`, add:

```typescript
export { createForgePlan, applyPlanAction, commitPlan, getPlannedStats, canRemoveOrb } from './forge/forge-plan.js';
export type { ForgePlan, PlanResult } from './forge/forge-plan.js';
```

- [ ] **Step 5: Run all engine tests**

Run: `cd packages/engine && npx vitest run`
Expected: ALL PASS (existing forge tests + new forge-plan tests)

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/forge/forge-plan.ts packages/engine/tests/forge-plan.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add commitPlan, getPlannedStats, canRemoveOrb + exports"
```

---

## Chunk 2: Client — Shared Utilities & Component Updates

### Task 5: Extract shared utilities

**Files:**
- Create: `packages/client/src/shared/utils/stat-label.ts`
- Create: `packages/client/src/shared/utils/affix-order.ts`
- Create: `packages/client/src/shared/utils/element-theme.ts`
- Modify: `packages/client/src/pages/Draft.tsx`

- [ ] **Step 1: Create stat-label.ts**

Extract `getStatLabel` from `Draft.tsx` (lines 15-22) into `packages/client/src/shared/utils/stat-label.ts`:

```typescript
import type { AffixDef, AffixTier, OrbInstance } from '@alloy/engine';

export function getStatLabel(
  affix: AffixDef,
  orb: OrbInstance,
  target: 'weapon' | 'armor' = 'weapon',
): string {
  const tierData = affix.tiers[orb.tier as AffixTier];
  const effects = target === 'weapon' ? tierData?.weaponEffect : tierData?.armorEffect;
  const stat = effects?.[0];
  if (!stat) return '';
  return stat.op === 'percent'
    ? `${Math.round(stat.value * 100)}%`
    : `+${stat.value}`;
}
```

- [ ] **Step 2: Create affix-order.ts**

```typescript
/** Deterministic display order for affixes in item cards.
 *  Ordered by category (offensive → defensive → sustain → utility → trigger),
 *  then by position within each category. */
export const AFFIX_DISPLAY_ORDER: string[] = [
  // Offensive
  'flat_physical', 'fire_damage', 'cold_damage', 'lightning_damage',
  'poison_damage', 'shadow_damage', 'chaos_damage',
  'crit_chance', 'crit_damage', 'attack_speed',
  'armor_penetration', 'elemental_penetration',
  // Defensive
  'flat_hp', 'armor_rating', 'block_chance', 'dodge_chance',
  'barrier', 'hp_regen', 'damage_reduction', 'fortify',
  // Sustain
  'lifesteal', 'thorns', 'life_on_kill',
  // Utility
  'initiative', 'dot_multiplier', 'stun_chance', 'slow_on_hit',
  // Trigger
  'chance_on_hit', 'chance_on_taking_damage', 'chance_on_crit',
  'chance_on_block', 'chance_on_kill', 'chance_on_low_hp',
];

export function getAffixDisplayIndex(affixId: string): number {
  const idx = AFFIX_DISPLAY_ORDER.indexOf(affixId);
  return idx === -1 ? AFFIX_DISPLAY_ORDER.length : idx;
}

/** Sort equipped slots by deterministic affix display order */
export function sortAffixesByDisplayOrder<T extends { affixId: string }>(affixes: T[]): T[] {
  return [...affixes].sort((a, b) => getAffixDisplayIndex(a.affixId) - getAffixDisplayIndex(b.affixId));
}
```

- [ ] **Step 3: Create element-theme.ts**

Consolidate the duplicated element color maps from `OrbIcon.tsx` and `GemCard.tsx`:

```typescript
export const ELEMENT_COLORS: Record<string, string> = {
  fire: 'var(--color-fire)', cold: 'var(--color-cold)',
  lightning: 'var(--color-lightning)', poison: 'var(--color-poison)',
  shadow: 'var(--color-shadow)', chaos: 'var(--color-chaos)',
  physical: '#c0c0c0',
};

export const ELEMENT_GRADIENTS: Record<string, { bg: string; border: string; glow: string }> = {
  fire:      { bg: 'rgba(232,85,58,0.4),rgba(232,85,58,0.12)',   border: 'var(--color-fire)',      glow: 'var(--color-fire)' },
  cold:      { bg: 'rgba(58,155,232,0.4),rgba(58,155,232,0.12)', border: 'var(--color-cold)',      glow: 'var(--color-cold)' },
  lightning: { bg: 'rgba(212,192,64,0.4),rgba(212,192,64,0.12)', border: 'var(--color-lightning)', glow: 'var(--color-lightning)' },
  poison:    { bg: 'rgba(45,179,105,0.4),rgba(45,179,105,0.12)', border: 'var(--color-poison)',    glow: 'var(--color-poison)' },
  shadow:    { bg: 'rgba(139,58,232,0.4),rgba(139,58,232,0.12)', border: 'var(--color-shadow)',    glow: 'var(--color-shadow)' },
  chaos:     { bg: 'rgba(232,58,139,0.4),rgba(232,58,139,0.12)', border: 'var(--color-chaos)',     glow: 'var(--color-chaos)' },
  physical:  { bg: 'rgba(192,192,192,0.3),rgba(120,120,120,0.1)', border: '#9a9a9a',               glow: '#c0c0c0' },
};

export const ELEMENT_EMOJIS: Record<string, string> = {
  fire: '\u{1F525}', cold: '\u{2744}', lightning: '\u{26A1}',
  poison: '\u{2620}', shadow: '\u{1F319}', chaos: '\u{1F300}', physical: '\u{2694}',
};

export const TIER_COLORS: Record<number, string> = {
  1: 'var(--color-tier-1)', 2: 'var(--color-tier-2)',
  3: 'var(--color-tier-3)', 4: 'var(--color-tier-4)',
};
```

- [ ] **Step 4: Update Draft.tsx to use shared stat-label**

In `packages/client/src/pages/Draft.tsx`, replace the inline `getStatLabel` function (lines 15-22) with:

```typescript
import { getStatLabel } from '@/shared/utils/stat-label';
```

Remove the inline function definition.

- [ ] **Step 5: Run client tests and dev server to verify no regressions**

Run: `cd packages/client && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/shared/utils/ packages/client/src/pages/Draft.tsx
git commit -m "refactor(client): extract shared utils (stat-label, affix-order, element-theme)"
```

---

### Task 6: Add tier rendering to GemCard

**Depends on:** Task 5 (needs `TIER_COLORS` from `element-theme.ts`)

**Files:**
- Modify: `packages/client/src/components/GemCard.tsx`

- [ ] **Step 1: Add tier visual indicator to GemCard**

In `GemCard.tsx`, the `tier` prop is accepted but never rendered. Import `TIER_COLORS` from `@/shared/utils/element-theme`. Add tier-colored border glow for T3+ and small tier dots below the stat value inside the gem square. Reference `OrbIcon.tsx` lines 137-150 for the tier dot pattern. Add the dots inside the gem square div, after the stat `<span>`, and add `box-shadow` for T3+ glow based on `TIER_COLORS[tier]`.

- [ ] **Step 2: Verify visually in dev server**

Run the dev server, navigate to draft screen, confirm gems show tier indicators.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/GemCard.tsx
git commit -m "feat(client): add tier visual indicator to GemCard"
```

---

### Task 7: Add flux-pop keyframe to index.css

**Files:**
- Modify: `packages/client/src/index.css`

- [ ] **Step 1: Add keyframe**

Add after the existing `phase-title` keyframe:

```css
@keyframes flux-pop {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-30px) scale(1.2); }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/index.css
git commit -m "feat(client): add flux-pop keyframe animation"
```

---

## Chunk 3: Client — ForgeStore Rewrite & Forge Page

### Task 8: Rewrite forgeStore

**Files:**
- Modify: `packages/client/src/stores/forgeStore.ts`
- Modify: `packages/client/src/stores/forgeStore.test.ts`

- [ ] **Step 1: Write failing tests for new store shape**

Rewrite `forgeStore.test.ts` to test: `initPlan` creates a plan, `applyAction` delegates to engine, `getCommitActions` returns action log, `selectOrb` / `startDrag` / `endDrag` state management, `openConfirmModal` / `closeConfirmModal`, `reset` clears everything.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement new forgeStore**

Rewrite `forgeStore.ts` with the new interface from the spec. The store wraps engine `ForgePlan` functions. Key type:

```typescript
type DragSource =
  | { from: 'stockpile'; orbUid: string }
  | { from: 'card'; cardId: 'weapon' | 'armor'; slotIndex: number; orbUid: string }
  | { from: 'combo'; slot: 'a' | 'b'; orbUid: string };
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/forgeStore.ts packages/client/src/stores/forgeStore.test.ts
git commit -m "refactor(client): rewrite forgeStore with ForgePlan integration"
```

---

### Task 9: Rewrite Forge.tsx — Layout & Item Cards

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

This is the largest task. Rewrite the entire Forge page following the component tree from the spec. Reference the mockup at `packages/client/public/mockups/forge-v3-hybrid.html` for exact styling.

- [ ] **Step 1: Write the page scaffold with header, item cards row, and stats bar**

Replace `Forge.tsx` with the new component tree. Start with static layout: ForgeHeader, two ItemCard components side-by-side (weapon + armor), StatsBar. Wire up `useForgeStore.initPlan()` on mount. Use `getPlannedStats()` for live stats. Render item cards with WoW-style sections: name, type, inherent bonuses (teal), base stats (vertical, bronze), affix lines (green, deterministic order), compound lines (gold), empty sockets.

- [ ] **Step 2: Verify layout in dev server**

Start a match, navigate to forge, confirm both items visible side-by-side with correct sections.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(client): forge page layout with side-by-side WoW-style item cards"
```

---

### Task 10: Forge.tsx — Stockpile with GemCards

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

- [ ] **Step 1: Add stockpile section with GemCard grid**

Replace the OrbIcon stockpile grid with GemCard components at 72px, 4 columns. Use `getStatLabel()` from shared utils. Wire click-to-select via `forgeStore.selectOrb()`.

- [ ] **Step 2: Verify in dev server**

Confirm stockpile shows rich GemCards with element gradients, emoji, stat labels, tier indicators, and category labels.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(client): forge stockpile with GemCard visuals"
```

---

### Task 11: Forge.tsx — Click interactions & flux tracking

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

- [ ] **Step 1: Implement click-to-place and click-to-remove**

- Click stockpile gem → select. Click empty socket → `applyPlanAction(assign_orb)`.
- Click equipped affix line (hover shows ✕) → `applyPlanAction(remove_orb)`.
- Flux counter in header updates from `plan.tentativeFlux`. Color-coded: green (>2), yellow (≤2), red (0).
- Floating flux popup on change (uses `flux-pop` keyframe).

- [ ] **Step 2: Verify interactions in dev server**

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(client): click interactions and flux tracking in forge"
```

---

### Task 12: Forge.tsx — Drag-and-drop

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

- [ ] **Step 1: Implement pointer-event drag-and-drop**

Follow the Draft screen's pointer event pattern. Support all 6 drag routes from the spec:
- Stockpile → item card, Stockpile → combo socket
- Item card → stockpile, Item card → other item card
- Combo socket → stockpile, Combo socket → item card

Add DragGhost component (80px GemCard, golden drop-shadow, follows cursor). Add drop-target highlighting (gold glow on valid targets). 6px drag threshold.

- [ ] **Step 2: Verify all drag routes in dev server**

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(client): drag-and-drop in forge (all 6 routes)"
```

---

### Task 13: Forge.tsx — Combination workbench

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

- [ ] **Step 1: Implement CombinationWorkbench**

Two combo sockets, result preview, COMBINE button (permanent, costs flux), CLEAR button (returns gems). Dragging filled combo sockets out. Recipe detection using `registry.getCombination()`. COMBINE calls `applyPlanAction(combine)` and locks orbs.

- [ ] **Step 2: Verify in dev server**

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(client): combination workbench with permanent forging"
```

---

### Task 14: Forge.tsx — Confirmation modal & commit flow

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

- [ ] **Step 1: Add ConfirmModal and commit flow**

"Done Forging" opens modal with "Commit your forge?" — CONFIRM / CANCEL. CONFIRM replays actions via `matchStore.dispatch`, triggers AI forge, transitions to duel. Timer expiry auto-commits (dismisses modal if open, uses `committed` flag to prevent double-commit).

- [ ] **Step 2: Verify full flow: place gems → click Done → modal → CONFIRM → duel phase**

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(client): confirmation modal and commit flow in forge"
```

---

## Chunk 4: Testing & Documentation

### Task 15: Component tests for Forge

**Files:**
- Create: `packages/client/src/pages/__tests__/Forge.test.tsx`

- [ ] **Step 1: Write component tests**

Tests from spec: renders both item cards, deterministic affix ordering, flux counter updates, confirmation modal, locked affixes, socket pulse, GemCard in stockpile.

- [ ] **Step 2: Run tests**

Run: `cd packages/client && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/__tests__/Forge.test.tsx
git commit -m "test(client): add component tests for forge page"
```

---

### Task 16: Update E2E fixtures and existing tests

**Files:**
- Modify: `packages/client/e2e/fixtures/match.ts`
- Modify: `packages/client/e2e/match-flow.spec.ts`

- [ ] **Step 1: Update `completeForge` helper to click CONFIRM in modal**

```typescript
export async function completeForge(page: Page): Promise<void> {
  const doneBtn = page.getByRole('button', { name: 'Done Forging' });
  await expect(doneBtn).toBeVisible({ timeout: 5000 });
  await doneBtn.click();
  // New: click confirm in the modal
  const confirmBtn = page.getByRole('button', { name: 'CONFIRM' });
  await expect(confirmBtn).toBeVisible({ timeout: 3000 });
  await confirmBtn.click();
  await waitForPhase(page, 'duel');
}
```

- [ ] **Step 2: Update `placeOrbs` selectors for new GemCard-based stockpile**

Update selectors from `button[title*="(T"]` to match new GemCard `[data-gem]` attribute and new empty socket selectors.

- [ ] **Step 3: Run existing E2E tests**

Run: `cd packages/client && npx playwright test e2e/match-flow.spec.ts`
Expected: PASS (with updated screenshots)

- [ ] **Step 4: Update screenshots**

Run: `cd packages/client && npx playwright test e2e/match-flow.spec.ts --update-snapshots`

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/
git commit -m "fix(e2e): update forge helpers and screenshots for redesign"
```

---

### Task 17: New Playwright E2E tests for forge redesign

**Files:**
- Create: `packages/client/e2e/forge-redesign.spec.ts`

- [ ] **Step 1: Write E2E tests**

Tests from spec: both items visible, place via click, place via drag, remove click, combine in workbench, confirm modal flow, cancel modal, flux tracking, drag between items, timer+modal race.

- [ ] **Step 2: Run E2E tests**

Run: `cd packages/client && npx playwright test e2e/forge-redesign.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/forge-redesign.spec.ts
git commit -m "test(e2e): add forge redesign E2E tests with screenshots"
```

---

### Task 18: Documentation updates

**Files:**
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: Update HANDOFF.md**

Add section on ForgePlan architecture (planning mode, commit flow, action replay). Update forge UI description (side-by-side item cards, GemCard stockpile, drag-and-drop, combination workbench). Update test gaps section (mark forge component tests as added).

- [ ] **Step 2: Commit**

```bash
git add docs/HANDOFF.md
git commit -m "docs: update HANDOFF.md with forge redesign architecture"
```

---

### Task 19: Final verification

- [ ] **Step 1: Run all engine tests**

Run: `cd packages/engine && npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run all client tests**

Run: `cd packages/client && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Run all E2E tests**

Run: `cd packages/client && npx playwright test`
Expected: ALL PASS

- [ ] **Step 4: Run build**

Run: `cd /c/Projects/Alloy && pnpm build`
Expected: SUCCESS

- [ ] **Step 5: Final commit if any remaining changes**

```bash
git add -A && git commit -m "chore: forge redesign final cleanup"
```
