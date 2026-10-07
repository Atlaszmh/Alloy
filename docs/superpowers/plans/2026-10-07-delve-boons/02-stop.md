# Delve boons · B1: the stop, the first batch, the bot — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ordinary stop between depths offers three boons instead of the paid power-ups (spec §4): the first batch's 40 boons as data rows in `boons.json` (spec §3), the two load checks only they make possible (spec §1: a stop row in every family, no stop row with three identical tiers), `rollBoons` (three cards, three distinct families, a tier each by the depth's band and the door's bump, capped and `minDepth`-gated rows, a tier fallback), `rollStop` returning a `boons` stop off the guided start, `takeStop`'s `boon` action (free: the tier's effect pushed onto `DiveState.diveBuffs`), the bot's pick (spec §5: highest tier, then family order, never a pact) and `economySim`'s boons by family, with the DPS Lab's Economy view charting and tabling them.

**Architecture:** Everything rides Phase A's contract (`00-overview.md` → The contract). `rollBoons` lives beside A's `buffSum` in `delve/boons.ts`; `rollStop` and `takeStop` in `delve/stops.ts` branch on `DiveStop.kind`; guided stops and the anvil alcoves keep the power-up path (`stopKinds`, `pickKinds`, `runStop`) untouched. Boon effects whose handlers are B2's or B3's are inert until those areas merge: B1 only puts the entries on the dive. The stop now changes play, so the autopilot fingerprint is retired from Task 4 on; pacing is read in Phase D.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19.

**Spec:** `docs/superpowers/specs/2026-10-06-delve-boons-design.md` (authoritative): §1 load checks, §3 the first batch, §4 the stop, §5 the bot. Overview: `00-overview.md`.

---

## Base

- **Starts from:** `boons/main` with Phase A merged, in this area's worktree:

```bash
cd /c/Projects/Alloy && git worktree add ../alloy-boons-b1 -b boons/b1 boons/main
```

  Every path below is relative to `/c/Projects/alloy-boons-b1` (Git Bash).
- **Before Task 1:** build and measure:

```bash
cd /c/Projects/alloy-boons-b1
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

  Expected: no type errors; both suites green (A's handover states the counts; note them).
- **The fingerprint:** A's probe (`01-contract.md` → The fingerprint), copied to the scratchpad as `boons-b1-probe.test.ts`, measured before Task 1 into `boons-b1-before.json`. Tasks 1–3 leave it identical (the rows have no `shrine` weight, so the sanctums' draw is unchanged, and nothing calls `rollBoons` before Task 4). From Task 4 on the fingerprint is **retired**: play changes on purpose, and A's probe's `norm` (which reads a stop back as its old power-up shape) has no power-up kinds to map a `boons` stop to. Tasks 4–8 don't run it; Phase D re-baselines after B2 and B3 merge.

## Assumptions about Phase A (checked before Task 1; if one doesn't hold, adapt the named line and say so in the handover)

1. `registry.getBoons(): BoonDef[]` returns `boons.json`'s rows in file order; `getBoon(id): BoonDef | undefined`. `boons.json` is a top-level JSON array whose last row is `devotion`.
2. `boonsProblems(registry): string[]` in `src/data/boons-check.ts` collects into a local `problems: string[]` and returns it; `createDefaultRegistry` throws on any.
3. `registry.getDelveBalance().boons` is `{ offers: number; tierWeights: { fromDepth: number; weights: [number, number, number] }[] }`.
4. `DoorMods.boons?: number` is in the type **and** `DoorModsSchema` (Zod keeps it). Whether A set Gilded Halls' and Champion's Den's values in `delve.json` is checked in Task 1.
5. `src/delve/boons.ts` exists with `buffSum` and `boonCount(buffs, id)`.
6. Every reader of `stop.offers` narrows on `kind`: `bestStop` returns early unless `stop.kind === 'powerups'`; `takeBestAlcove` builds `{ kind: 'powerups', offers, taken: false }`; `takeGuidedStop` narrows; `runAutopilot`'s `run?.stops.push(...)` narrows; `chooseDoor` reads `required` only on a `powerups` stop; `runStop` never sees a `boon` action. The test fixtures A touched (`delve-stops.test.ts`'s `ALL`, `stopOf`, `atStop` callers; `delve-runes.test.ts`; `delve-banking.test.ts`; `delve-autopilot-crafting.test.ts`) build `kind: 'powerups'` stops.
7. `src/index.ts` exports the `types/boon.ts` consts and types (`BOON_FAMILIES`, `BoonFamily`, …), so the client imports `BOON_FAMILIES` from `@alloy/engine`.

## Files

| File | Change |
|---|---|
| `packages/engine/src/data/boons.json` | the 40 stop rows after `devotion` (Task 1) |
| `packages/engine/src/data/delve.json` | `gilded` `mods.boons: 0.5`, `champions` `mods.boons: 0.3`, if A didn't (Task 1) |
| `packages/engine/src/data/boons-check.ts` | `stopRowProblems`, called from `boonsProblems` (Task 2) |
| `packages/engine/src/delve/boons.ts` | `rollBoons` (Task 3) |
| `packages/engine/src/delve/stops.ts` | `rollStop` (ordinary stops roll boons), `takeStop` (the `boon` action) (Task 4) |
| `packages/engine/src/delve/autopilot.ts` | `takeBestStop` on a boons stop (Task 5); `runAutopilot` counts boons by family (Task 6) |
| `packages/engine/src/delve/economy.ts` | `EconomyDive.boons` (Task 6) |
| `packages/engine/tests/delve-boons-rows.test.ts` (new) | the rows, the doors, the stop-row and shrine-row load checks |
| `packages/engine/tests/delve-boons-stop.test.ts` (new) | `rollBoons`; `economySim`'s boons |
| `packages/engine/tests/delve-stops.test.ts` | the ordinary stop's tests rewritten for boons; the boon take; guided stops and alcoves; the bot's pick |
| `packages/engine/tests/delve-boons-a-check.test.ts` (A's) | its one-row fixtures carry the shipped stop rows, so its exact matchers hold under the family check (Task 2) |
| `packages/engine/tests/delve-boons-a-stop.test.ts` (A's) | its "rolls a 'powerups' stop" test deleted; its boon refusal on a `boons` stop becomes a take (Task 4) |
| `packages/engine/tests/delve-runes.test.ts` | the ordinary stop's 40-seed power-up pin deleted (the draw is the alcoves' now, pinned in `delve-maps-flow.test.ts`) |
| `packages/client/src/features/delve/lab/economy-model.ts` | the `'boons'` chart choice |
| `packages/client/src/features/delve/lab/EconomyView.tsx` | the choice in the Chart select; the "Boons" column |
| `packages/client/src/features/delve/lab/__tests__/economy-model.test.ts`, `EconomyView.test.tsx` | fixtures carry `boons`; the new line set and column |

## Conventions

The overview's. In short: one commit per task on `boons/b1`, staged by path, ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never push or merge. Keep each file's line endings. Prettier (`npx prettier --end-of-line auto --write <files>`) only on `.ts`/`.tsx` files this plan creates or edits **except** `autopilot.ts` and `delve-pacing*.test.ts`; JSON files are hand-edited, never formatted. "Replace: … with: …" is one Edit; "Append" adds at the end of the file or block named.

**Commands** (from the worktree root):

| What | Command |
|---|---|
| Engine typecheck + files | `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot)` |
| Engine bundle | `(cd packages/engine && npx tsup)` |
| Client typecheck + files | `(cd packages/client && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot)` |

---

## Task 1: The first batch as data

The 40 rows of spec §3, after the six shrine rows, each tier's effect exactly the spec's numbers in A's `BoonEffect` units (a bonus the added fraction; `flux`, `runes`, `gear` the raw factor), each tier's `text` the card's whole line. Stop weights: `{ 10, 6, 3 }`, pacts `{ 4, 3, 2 }`, floor `{ 6, 4, 2 }`. No row has `shrine`, so the sanctums draw as before.

**Files:** `packages/engine/src/data/boons.json`, `packages/engine/src/data/delve.json`, `packages/engine/tests/delve-boons-rows.test.ts` (new)

- [ ] **Step 1: Write the failing test.** Create `packages/engine/tests/delve-boons-rows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BOON_FAMILIES, type BoonDef } from '../src/types/boon.js';
import { registry } from './fixtures/arena.js';

// See the boons spec: §1 the row, §3 the first batch.

const SHRINES = ['vigor', 'renewal', 'clarity', 'fortune', 'mercy', 'devotion'];
const atStop = (b: BoonDef) => b.weight.common + b.weight.rare + b.weight.epic > 0;
const row = (id: string) => registry.getBoon(id)!;
const effects = (id: string) => row(id).tiers.map((t) => t.effect);

describe('the first batch of boons', () => {
  it('follows the six shrine rows, 40 stop rows, every one a dive boon and never a shrine', () => {
    const boons = registry.getBoons();
    expect(boons.slice(0, 6).map((b) => b.id)).toEqual(SHRINES);
    const stop = boons.slice(6);
    expect(stop).toHaveLength(40);
    expect(boons.filter(atStop)).toEqual(stop);
    for (const b of stop) {
      expect(b.duration, b.id).toBe('dive');
      expect(b.shrine, b.id).toBeUndefined();
      expect(b.id, b.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      for (const t of b.tiers) expect(t.text.length, b.id).toBeGreaterThan(0);
    }
    const count = Object.fromEntries(
      BOON_FAMILIES.map((f) => [f, stop.filter((b) => b.family === f).length]),
    );
    expect(count).toEqual({
      offense: 6,
      element: 5,
      defense: 7,
      tempo: 5,
      fortune: 7,
      pact: 6,
      floor: 4,
    });
  });

  it('draws by tier: pacts and floor boons rarer than the rest', () => {
    for (const b of registry.getBoons().filter(atStop)) {
      const want =
        b.family === 'pact'
          ? { common: 4, rare: 3, epic: 2 }
          : b.family === 'floor'
            ? { common: 6, rare: 4, epic: 2 }
            : { common: 10, rare: 6, epic: 3 };
      expect(b.weight, b.id).toEqual(want);
    }
  });

  it('caps and depth gates as the spec table says', () => {
    const caps = Object.fromEntries(registry.getBoons().slice(6).map((b) => [b.id, b.cap]));
    expect(caps).toEqual({
      'keen-edge': 3, 'heavy-hand': 2, opener: 2, closer: 2, executioner: 1, 'pack-breaker': 2,
      catalyst: 2, saturate: 1, 'lingering-mark': 2, 'pure-flame': 3, 'second-flame': 3,
      'third-wind': 1, 'perfect-form': 2, bulwark: 2, 'stone-skin': 2, 'deep-breath': 2,
      'vampires-tithe': 2, 'last-stand': 1,
      quickstep: 2, 'swift-hands': 2, 'free-cast': 1, echo: 1, overflow: 2,
      magpie: 2, 'wide-net': 1, prospector: 2, 'flux-nose': 2, 'rune-sense': 2, scrapper: 2,
      insurance: 1,
      'glass-cannon': 2, 'blood-price': 1, hunted: 1, 'no-retreat': 1, famine: 1,
      'deeper-still': 1,
      cartographer: 1, sanctuary: 1, trailblazer: 1, arsonist: 1,
    });
    const gated = registry
      .getBoons()
      .filter((b) => b.minDepth !== undefined)
      .map((b) => [b.id, b.minDepth]);
    expect(Object.fromEntries(gated)).toEqual({
      executioner: 3, saturate: 3, 'second-flame': 2, 'free-cast': 3, echo: 5,
      'glass-cannon': 4, 'blood-price': 6, hunted: 6, 'no-retreat': 4, famine: 4,
      'deeper-still': 4,
    });
  });

  it("holds each tier's numbers in the effect's units", () => {
    expect(effects('keen-edge')).toEqual([{ damage: 0.1 }, { damage: 0.15 }, { damage: 0.25 }]);
    expect(effects('swift-hands')).toEqual([
      { knobs: { quick: { cooldown: 0.92 } } },
      { knobs: { quick: { cooldown: 0.88 } } },
      { knobs: { quick: { cooldown: 0.82 } } },
    ]);
    expect(effects('saturate')).toEqual([
      { knobs: { stacksBonus: 1 } },
      { knobs: { stacksBonus: 1, stackTime: 0.2 } },
      { knobs: { stacksBonus: 2 } },
    ]);
    expect(effects('executioner')).toEqual([
      { lowLife: { below: 0.25, mult: 0.4 } },
      { lowLife: { below: 0.25, mult: 0.6 } },
      { lowLife: { below: 0.35, mult: 0.6 } },
    ]);
    expect(effects('third-wind')).toEqual([
      { dodgeCharges: 1 },
      { dodgeCharges: 1, dodgeRecharge: 0.15 },
      { dodgeCharges: 1, dodgeWindow: 0.3 },
    ]);
    expect(effects('second-flame')[2]).toEqual({ attune: { role: 'secondary', points: 10 } });
    expect(effects('flux-nose')).toEqual([{ flux: 1.3 }, { flux: 1.5 }, { flux: 1.8 }]);
    expect(effects('insurance')).toEqual([
      { deathLoss: 0.1 },
      { deathLoss: 0.15 },
      { deathLoss: 0.2 },
    ]);
    expect(effects('glass-cannon')[0]).toEqual({ damage: 0.25, maxLife: -0.2 });
    expect(effects('blood-price')[2]).toEqual({ bloodPrice: 0.5, damage: 0.4 });
    expect(effects('hunted')[1]).toEqual({ eliteChance: 1, gear: 1.8, scrap: 0.4 });
    expect(effects('no-retreat')[0]).toEqual({ dodgeCharges: -1, perfectAlways: true });
    expect(effects('deeper-still')).toEqual([
      { skip: 1, find: 20 },
      { skip: 2, find: 30 },
      { skip: 2, find: 50 },
    ]);
    expect(effects('cartographer')[0]).toEqual({ exitRevealed: true });
    expect(effects('arsonist')).toEqual([
      { hazardsFriendly: 0.5 },
      { hazardsFriendly: 0.65 },
      { hazardsFriendly: 0.8 },
    ]);
    expect(row('vampires-tithe').name).toBe("Vampire's Tithe");
  });

  it('a gilded or a champion door leans the next stop rarer', () => {
    expect(registry.getDoor('gilded').mods.boons).toBe(0.5);
    expect(registry.getDoor('champions').mods.boons).toBe(0.3);
    expect(registry.getDoor('winding').mods.boons).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it.** `(cd packages/engine && npx vitest run tests/delve-boons-rows.test.ts --reporter=dot)`. Expected: FAIL (the stop rows are missing: `toHaveLength(40)` receives 0; the door test fails unless A set the doors).

- [ ] **Step 3: Add the rows.** In `packages/engine/src/data/boons.json`, after the closing `}` of the `devotion` row (the array's last element), add a `,` and these 40 rows (hand-edited; keep the file's indentation and line endings):

```json
  {
    "id": "keen-edge", "name": "Keen Edge", "family": "offense", "duration": "dive", "cap": 3,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+10% damage", "effect": { "damage": 0.1 } },
      { "text": "+15% damage", "effect": { "damage": 0.15 } },
      { "text": "+25% damage", "effect": { "damage": 0.25 } }
    ]
  },
  {
    "id": "heavy-hand", "name": "Heavy Hand", "family": "offense", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Heavy and hold attacks deal +20% damage", "effect": { "byKind": { "heavy": 0.2, "hold": 0.2 } } },
      { "text": "Heavy and hold attacks deal +30% damage", "effect": { "byKind": { "heavy": 0.3, "hold": 0.3 } } },
      { "text": "Heavy and hold attacks deal +45% damage", "effect": { "byKind": { "heavy": 0.45, "hold": 0.45 } } }
    ]
  },
  {
    "id": "opener", "name": "Opener", "family": "offense", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "A chain's first move deals +25% damage", "effect": { "firstMove": 0.25 } },
      { "text": "A chain's first move deals +40% damage", "effect": { "firstMove": 0.4 } },
      { "text": "A chain's first move deals +60% damage", "effect": { "firstMove": 0.6 } }
    ]
  },
  {
    "id": "closer", "name": "Closer", "family": "offense", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Each step of a chain lands harder: step bonus +0.05", "effect": { "stepBonus": 0.05 } },
      { "text": "Each step of a chain lands harder: step bonus +0.08", "effect": { "stepBonus": 0.08 } },
      { "text": "Each step of a chain lands harder: step bonus +0.12", "effect": { "stepBonus": 0.12 } }
    ]
  },
  {
    "id": "executioner", "name": "Executioner", "family": "offense", "duration": "dive", "cap": 1, "minDepth": 3,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+40% damage to foes under 25% life", "effect": { "lowLife": { "below": 0.25, "mult": 0.4 } } },
      { "text": "+60% damage to foes under 25% life", "effect": { "lowLife": { "below": 0.25, "mult": 0.6 } } },
      { "text": "+60% damage to foes under 35% life", "effect": { "lowLife": { "below": 0.35, "mult": 0.6 } } }
    ]
  },
  {
    "id": "pack-breaker", "name": "Pack Breaker", "family": "offense", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+5% damage for each foe within 4, up to 4 foes", "effect": { "nearFoes": { "per": 0.05, "cap": 4, "radius": 4 } } },
      { "text": "+8% damage for each foe within 4, up to 4 foes", "effect": { "nearFoes": { "per": 0.08, "cap": 4, "radius": 4 } } },
      { "text": "+12% damage for each foe within 4, up to 4 foes", "effect": { "nearFoes": { "per": 0.12, "cap": 4, "radius": 4 } } }
    ]
  },
  {
    "id": "catalyst", "name": "Catalyst", "family": "element", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Reaction bonuses grow 25%", "effect": { "knobs": { "catalyst": 0.25 } } },
      { "text": "Reaction bonuses grow 40%", "effect": { "knobs": { "catalyst": 0.4 } } },
      { "text": "Reaction bonuses grow 60%", "effect": { "knobs": { "catalyst": 0.6 } } }
    ]
  },
  {
    "id": "saturate", "name": "Saturate", "family": "element", "duration": "dive", "cap": 1, "minDepth": 3,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+1 stack a hit", "effect": { "knobs": { "stacksBonus": 1 } } },
      { "text": "+1 stack a hit, and stacks last 20% longer", "effect": { "knobs": { "stacksBonus": 1, "stackTime": 0.2 } } },
      { "text": "+2 stacks a hit", "effect": { "knobs": { "stacksBonus": 2 } } }
    ]
  },
  {
    "id": "lingering-mark", "name": "Lingering Mark", "family": "element", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Elemental stacks last 30% longer", "effect": { "knobs": { "stackTime": 0.3 } } },
      { "text": "Elemental stacks last 50% longer", "effect": { "knobs": { "stackTime": 0.5 } } },
      { "text": "Elemental stacks last 80% longer", "effect": { "knobs": { "stackTime": 0.8 } } }
    ]
  },
  {
    "id": "pure-flame", "name": "Pure Flame", "family": "element", "duration": "dive", "cap": 3,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+4 attunement in your primary element", "effect": { "attune": { "role": "primary", "points": 4 } } },
      { "text": "+6 attunement in your primary element", "effect": { "attune": { "role": "primary", "points": 6 } } },
      { "text": "+10 attunement in your primary element", "effect": { "attune": { "role": "primary", "points": 10 } } }
    ]
  },
  {
    "id": "second-flame", "name": "Second Flame", "family": "element", "duration": "dive", "cap": 3, "minDepth": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+4 attunement in your secondary element", "effect": { "attune": { "role": "secondary", "points": 4 } } },
      { "text": "+6 attunement in your secondary element", "effect": { "attune": { "role": "secondary", "points": 6 } } },
      { "text": "+10 attunement in your secondary element", "effect": { "attune": { "role": "secondary", "points": 10 } } }
    ]
  },
  {
    "id": "third-wind", "name": "Third Wind", "family": "defense", "duration": "dive", "cap": 1,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+1 dodge charge", "effect": { "dodgeCharges": 1 } },
      { "text": "+1 dodge charge, and dodges recharge 15% faster", "effect": { "dodgeCharges": 1, "dodgeRecharge": 0.15 } },
      { "text": "+1 dodge charge, and a perfect dodge's window +30%", "effect": { "dodgeCharges": 1, "dodgeWindow": 0.3 } }
    ]
  },
  {
    "id": "perfect-form", "name": "Perfect Form", "family": "defense", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "A perfect dodge's window +30%", "effect": { "dodgeWindow": 0.3 } },
      { "text": "A perfect dodge's window +50%", "effect": { "dodgeWindow": 0.5 } },
      { "text": "A perfect dodge's window +80%", "effect": { "dodgeWindow": 0.8 } }
    ]
  },
  {
    "id": "bulwark", "name": "Bulwark", "family": "defense", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Your Defensive lasts 25% longer", "effect": { "defendDuration": 0.25 } },
      { "text": "Your Defensive lasts 40% longer", "effect": { "defendDuration": 0.4 } },
      { "text": "Your Defensive lasts 60% longer", "effect": { "defendDuration": 0.6 } }
    ]
  },
  {
    "id": "stone-skin", "name": "Stone Skin", "family": "defense", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Start each floor behind a barrier of 8% of your life", "effect": { "barrierOnFloor": 0.08 } },
      { "text": "Start each floor behind a barrier of 12% of your life", "effect": { "barrierOnFloor": 0.12 } },
      { "text": "Start each floor behind a barrier of 18% of your life", "effect": { "barrierOnFloor": 0.18 } }
    ]
  },
  {
    "id": "deep-breath", "name": "Deep Breath", "family": "defense", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Regain 4% of your life for each room you clear", "effect": { "healOnClear": 0.04 } },
      { "text": "Regain 6% of your life for each room you clear", "effect": { "healOnClear": 0.06 } },
      { "text": "Regain 10% of your life for each room you clear", "effect": { "healOnClear": 0.1 } }
    ]
  },
  {
    "id": "vampires-tithe", "name": "Vampire's Tithe", "family": "defense", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "1.5% lifesteal", "effect": { "lifesteal": 0.015 } },
      { "text": "2.5% lifesteal", "effect": { "lifesteal": 0.025 } },
      { "text": "4% lifesteal", "effect": { "lifesteal": 0.04 } }
    ]
  },
  {
    "id": "last-stand", "name": "Last Stand", "family": "defense", "duration": "dive", "cap": 1,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Once a floor, under 20% life: take 40% less damage for 2 s", "effect": { "lastStand": { "below": 0.2, "reduce": 0.4, "seconds": 2 } } },
      { "text": "Once a floor, under 20% life: take 50% less damage for 3 s", "effect": { "lastStand": { "below": 0.2, "reduce": 0.5, "seconds": 3 } } },
      { "text": "Once a floor, under 20% life: take 60% less damage for 4 s", "effect": { "lastStand": { "below": 0.2, "reduce": 0.6, "seconds": 4 } } }
    ]
  },
  {
    "id": "quickstep", "name": "Quickstep", "family": "tempo", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Beats and holds 8% faster", "effect": { "tempo": 0.08 } },
      { "text": "Beats and holds 12% faster", "effect": { "tempo": 0.12 } },
      { "text": "Beats and holds 18% faster", "effect": { "tempo": 0.18 } }
    ]
  },
  {
    "id": "swift-hands", "name": "Swift Hands", "family": "tempo", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Ability cooldowns −8%", "effect": { "knobs": { "quick": { "cooldown": 0.92 } } } },
      { "text": "Ability cooldowns −12%", "effect": { "knobs": { "quick": { "cooldown": 0.88 } } } },
      { "text": "Ability cooldowns −18%", "effect": { "knobs": { "quick": { "cooldown": 0.82 } } } }
    ]
  },
  {
    "id": "free-cast", "name": "Free Cast", "family": "tempo", "duration": "dive", "cap": 1, "minDepth": 3,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "An ability cast within 1.5 s of a dodge costs nothing", "effect": { "freeCast": { "seconds": 1.5, "damage": 0 } } },
      { "text": "An ability cast within 1.5 s of a dodge costs nothing and deals +10% damage", "effect": { "freeCast": { "seconds": 1.5, "damage": 0.1 } } },
      { "text": "An ability cast within 1.5 s of a dodge costs nothing and deals +25% damage", "effect": { "freeCast": { "seconds": 1.5, "damage": 0.25 } } }
    ]
  },
  {
    "id": "echo", "name": "Echo", "family": "tempo", "duration": "dive", "cap": 1, "minDepth": 5,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Attacks and abilities echo at 15% power at least", "effect": { "knobs": { "echo": 0.15 } } },
      { "text": "Attacks and abilities echo at 25% power at least", "effect": { "knobs": { "echo": 0.25 } } },
      { "text": "Attacks and abilities echo at 40% power at least", "effect": { "knobs": { "echo": 0.4 } } }
    ]
  },
  {
    "id": "overflow", "name": "Overflow", "family": "tempo", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+20% mana regen", "effect": { "manaRegen": 0.2 } },
      { "text": "+35% mana regen", "effect": { "manaRegen": 0.35 } },
      { "text": "+50% mana regen", "effect": { "manaRegen": 0.5 } }
    ]
  },
  {
    "id": "magpie", "name": "Magpie", "family": "fortune", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+25 Find", "effect": { "find": 25 } },
      { "text": "+40 Find", "effect": { "find": 40 } },
      { "text": "+60 Find", "effect": { "find": 60 } }
    ]
  },
  {
    "id": "wide-net", "name": "Wide Net", "family": "fortune", "duration": "dive", "cap": 1,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Pickups fly to you from 40% farther", "effect": { "magnet": 0.4 } },
      { "text": "Pickups fly to you from 70% farther", "effect": { "magnet": 0.7 } },
      { "text": "Pickups fly to you from twice as far", "effect": { "magnet": 1 } }
    ]
  },
  {
    "id": "prospector", "name": "Prospector", "family": "fortune", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+10% chance a bar drops as the next metal up", "effect": { "metalUp": 0.1 } },
      { "text": "+15% chance a bar drops as the next metal up", "effect": { "metalUp": 0.15 } },
      { "text": "+25% chance a bar drops as the next metal up", "effect": { "metalUp": 0.25 } }
    ]
  },
  {
    "id": "flux-nose", "name": "Flux Nose", "family": "fortune", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Flux drops ×1.3 as often", "effect": { "flux": 1.3 } },
      { "text": "Flux drops ×1.5 as often", "effect": { "flux": 1.5 } },
      { "text": "Flux drops ×1.8 as often", "effect": { "flux": 1.8 } }
    ]
  },
  {
    "id": "rune-sense", "name": "Rune Sense", "family": "fortune", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "Runes drop ×1.3 as often", "effect": { "runes": 1.3 } },
      { "text": "Runes drop ×1.5 as often", "effect": { "runes": 1.5 } },
      { "text": "Runes drop ×1.8 as often", "effect": { "runes": 1.8 } }
    ]
  },
  {
    "id": "scrapper", "name": "Scrapper", "family": "fortune", "duration": "dive", "cap": 2,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "+20% scrap from kills", "effect": { "scrap": 0.2 } },
      { "text": "+35% scrap from kills", "effect": { "scrap": 0.35 } },
      { "text": "+50% scrap from kills", "effect": { "scrap": 0.5 } }
    ]
  },
  {
    "id": "insurance", "name": "Insurance", "family": "fortune", "duration": "dive", "cap": 1,
    "weight": { "common": 10, "rare": 6, "epic": 3 },
    "tiers": [
      { "text": "A death loses 10 points less of what the dive banked", "effect": { "deathLoss": 0.1 } },
      { "text": "A death loses 15 points less of what the dive banked", "effect": { "deathLoss": 0.15 } },
      { "text": "A death loses 20 points less of what the dive banked", "effect": { "deathLoss": 0.2 } }
    ]
  },
  {
    "id": "glass-cannon", "name": "Glass Cannon", "family": "pact", "duration": "dive", "cap": 2, "minDepth": 4,
    "weight": { "common": 4, "rare": 3, "epic": 2 },
    "tiers": [
      { "text": "+25% damage, −20% max life", "effect": { "damage": 0.25, "maxLife": -0.2 } },
      { "text": "+35% damage, −20% max life", "effect": { "damage": 0.35, "maxLife": -0.2 } },
      { "text": "+45% damage, −20% max life", "effect": { "damage": 0.45, "maxLife": -0.2 } }
    ]
  },
  {
    "id": "blood-price", "name": "Blood Price", "family": "pact", "duration": "dive", "cap": 1, "minDepth": 6,
    "weight": { "common": 4, "rare": 3, "epic": 2 },
    "tiers": [
      { "text": "Abilities cost life, not mana, and mana doesn't regenerate; +20% damage", "effect": { "bloodPrice": 0.5, "damage": 0.2 } },
      { "text": "Abilities cost life, not mana, and mana doesn't regenerate; +30% damage", "effect": { "bloodPrice": 0.5, "damage": 0.3 } },
      { "text": "Abilities cost life, not mana, and mana doesn't regenerate; +40% damage", "effect": { "bloodPrice": 0.5, "damage": 0.4 } }
    ]
  },
  {
    "id": "hunted", "name": "Hunted", "family": "pact", "duration": "dive", "cap": 1, "minDepth": 6,
    "weight": { "common": 4, "rare": 3, "epic": 2 },
    "tiers": [
      { "text": "An elite leads every pack; elites drop gear ×1.5 as often; +30% scrap from kills", "effect": { "eliteChance": 1, "gear": 1.5, "scrap": 0.3 } },
      { "text": "An elite leads every pack; elites drop gear ×1.8 as often; +40% scrap from kills", "effect": { "eliteChance": 1, "gear": 1.8, "scrap": 0.4 } },
      { "text": "An elite leads every pack; elites drop gear ×2 as often; +60% scrap from kills", "effect": { "eliteChance": 1, "gear": 2, "scrap": 0.6 } }
    ]
  },
  {
    "id": "no-retreat", "name": "No Retreat", "family": "pact", "duration": "dive", "cap": 1, "minDepth": 4,
    "weight": { "common": 4, "rare": 3, "epic": 2 },
    "tiers": [
      { "text": "One dodge charge, and every dodge is perfect", "effect": { "dodgeCharges": -1, "perfectAlways": true } },
      { "text": "One dodge charge, and every dodge is perfect; +10% damage", "effect": { "dodgeCharges": -1, "perfectAlways": true, "damage": 0.1 } },
      { "text": "One dodge charge, and every dodge is perfect; +20% damage", "effect": { "dodgeCharges": -1, "perfectAlways": true, "damage": 0.2 } }
    ]
  },
  {
    "id": "famine", "name": "Famine", "family": "pact", "duration": "dive", "cap": 1, "minDepth": 4,
    "weight": { "common": 4, "rare": 3, "epic": 2 },
    "tiers": [
      { "text": "No potions on any floor; +15% damage and +30 Find", "effect": { "noPotions": true, "damage": 0.15, "find": 30 } },
      { "text": "No potions on any floor; +20% damage and +40 Find", "effect": { "noPotions": true, "damage": 0.2, "find": 40 } },
      { "text": "No potions on any floor; +25% damage and +60 Find", "effect": { "noPotions": true, "damage": 0.25, "find": 60 } }
    ]
  },
  {
    "id": "deeper-still", "name": "Deeper Still", "family": "pact", "duration": "dive", "cap": 1, "minDepth": 4,
    "weight": { "common": 4, "rare": 3, "epic": 2 },
    "tiers": [
      { "text": "The next door goes 1 depth further; +20 Find", "effect": { "skip": 1, "find": 20 } },
      { "text": "The next door goes 2 depths further; +30 Find", "effect": { "skip": 2, "find": 30 } },
      { "text": "The next door goes 2 depths further; +50 Find", "effect": { "skip": 2, "find": 50 } }
    ]
  },
  {
    "id": "cartographer", "name": "Cartographer", "family": "floor", "duration": "dive", "cap": 1,
    "weight": { "common": 6, "rare": 4, "epic": 2 },
    "tiers": [
      { "text": "Each floor starts with its exit's room revealed", "effect": { "exitRevealed": true } },
      { "text": "Each floor starts with its exit's room revealed; +10 Find", "effect": { "exitRevealed": true, "find": 10 } },
      { "text": "Each floor starts with its exit's room revealed; +20 Find", "effect": { "exitRevealed": true, "find": 20 } }
    ]
  },
  {
    "id": "sanctuary", "name": "Sanctuary", "family": "floor", "duration": "dive", "cap": 1,
    "weight": { "common": 6, "rare": 4, "epic": 2 },
    "tiers": [
      { "text": "Shrine blessings last the dive", "effect": { "shrinesLastDive": true } },
      { "text": "Shrine blessings last the dive; +10 Find", "effect": { "shrinesLastDive": true, "find": 10 } },
      { "text": "Shrine blessings last the dive; +20 Find", "effect": { "shrinesLastDive": true, "find": 20 } }
    ]
  },
  {
    "id": "trailblazer", "name": "Trailblazer", "family": "floor", "duration": "dive", "cap": 1,
    "weight": { "common": 6, "rare": 4, "epic": 2 },
    "tiers": [
      { "text": "Slow ground doesn't slow you", "effect": { "noSlow": true } },
      { "text": "Slow ground doesn't slow you; pickups fly to you from 15% farther", "effect": { "noSlow": true, "magnet": 0.15 } },
      { "text": "Slow ground doesn't slow you; pickups fly to you from 30% farther", "effect": { "noSlow": true, "magnet": 0.3 } }
    ]
  },
  {
    "id": "arsonist", "name": "Arsonist", "family": "floor", "duration": "dive", "cap": 1,
    "weight": { "common": 6, "rare": 4, "epic": 2 },
    "tiers": [
      { "text": "Hazards recharge 50% faster and never hurt you", "effect": { "hazardsFriendly": 0.5 } },
      { "text": "Hazards recharge 65% faster and never hurt you", "effect": { "hazardsFriendly": 0.65 } },
      { "text": "Hazards recharge 80% faster and never hurt you", "effect": { "hazardsFriendly": 0.8 } }
    ]
  }
```

  (Spec §3's "Opener ... +25%" etc. are expanded into whole card lines; the numbers are the spec's. `skip` stays a plain number per entry: B3's `chooseDoor` consumes it.)

- [ ] **Step 4: The doors.** If `registry.getDoor('gilded').mods.boons` is not already 0.5, in `packages/engine/src/data/delve.json` replace:

```json
        "essence": 1.5,
        "monsterHp": 0.25
```

  with:

```json
        "essence": 1.5,
        "monsterHp": 0.25,
        "boons": 0.5
```

  and replace:

```json
        "eliteChance": 1,
        "bountyMult": 1.5
```

  with:

```json
        "eliteChance": 1,
        "bountyMult": 1.5,
        "boons": 0.3
```

  (Hand-edit; don't reformat. The door's `text` is left alone: C1's `doorTerms` names the gain.)

- [ ] **Step 5: Run.** `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-rows.test.ts tests/delve-maps-flow.test.ts --reporter=dot)`, `tests/delve-boons-a-shrines.test.ts` (A's: every generated sanctum's shrine id over 20 seeds) and `tests/delve-boons-a-check.test.ts`. Expected: PASS. Then the fingerprint check: identical (no play change).

- [ ] **Step 6: Commit.**

```bash
cd /c/Projects/alloy-boons-b1
git add packages/engine/src/data/boons.json packages/engine/src/data/delve.json packages/engine/tests/delve-boons-rows.test.ts
git commit -m "feat(engine): the first batch of boons as data rows, and the doors that lean a stop rarer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: The load checks the rows make possible

Spec §1: at least one stop row in each family; no stop row's three tiers identical; a shrine row's effect within what a shrine can carry (no `knobs` or `attune`: spec §2a, attunement and knobs are stop boons' alone) and, on a `floor` shrine, no floor-shaping field (`exitRevealed`, `shrinesLastDive`, `noSlow`, `hazardsFriendly`, `skip`, `eliteChance`, `noPotions`). They land after the rows so the shipped data passes from the first commit.

**Files:** `packages/engine/src/data/boons-check.ts`, `packages/engine/tests/delve-boons-rows.test.ts`, `packages/engine/tests/delve-boons-a-check.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/delve-boons-rows.test.ts`, add to the imports:

```ts
import { boonsProblems, shrineRowProblems, stopRowProblems } from '../src/data/boons-check.js';
import type { DataRegistry } from '../src/data/registry.js';
```

  and append:

```ts
/** `registry` reading `rows` as its boons. */
const withBoons = (rows: BoonDef[]): DataRegistry =>
  Object.assign(Object.create(registry) as DataRegistry, { getBoons: () => rows });

describe('the boons load checks', () => {
  it('pass on the shipped rows', () => {
    expect(boonsProblems(registry)).toEqual([]);
    expect(stopRowProblems(registry.getBoons())).toEqual([]);
  });

  it('refuse a family with no stop row and a stop row whose three tiers are the same', () => {
    const rows = registry.getBoons().filter((b) => b.family !== 'floor' || !atStop(b));
    const keen = row('keen-edge');
    const flat: BoonDef = { ...keen, tiers: [keen.tiers[0], keen.tiers[0], keen.tiers[0]] };
    const bad = rows.map((b) => (b.id === 'keen-edge' ? flat : b));
    expect(stopRowProblems(bad)).toEqual([
      'no stop boon in floor',
      'keen-edge: its three tiers are the same',
    ]);
    expect(boonsProblems(withBoons(bad))).toEqual(
      expect.arrayContaining(['no stop boon in floor', 'keen-edge: its three tiers are the same']),
    );
  });

  it('refuse a shrine carrying knobs or attunement, and a floor shrine shaping the floor', () => {
    expect(shrineRowProblems(registry.getBoons())).toEqual([]);
    const vigor = row('vigor');
    const devotion = row('devotion');
    const three = (effect: BoonDef['tiers'][0]['effect']) =>
      [0, 1, 2].map(() => ({ text: 'x', effect })) as BoonDef['tiers'];
    const bad = [
      { ...vigor, tiers: three({ damage: 0.2, knobs: { echo: 0.1 } }) },
      { ...row('renewal'), tiers: three({ attune: { role: 'primary', points: 2 } }) },
      { ...row('fortune'), tiers: three({ find: 50, skip: 1 }) },
      { ...devotion, tiers: three({ damage: 0.1, skip: 1 }) }, // a dive shrine may
    ];
    expect(shrineRowProblems(bad)).toEqual([
      "vigor: a shrine can't carry knobs",
      "renewal: a shrine can't carry attune",
      "fortune: a floor shrine can't carry skip",
    ]);
    expect(boonsProblems(withBoons([...bad, ...registry.getBoons().slice(6)]))).toEqual(
      shrineRowProblems(bad),
    );
    // A stop row may carry them all.
    expect(shrineRowProblems([row('deeper-still'), row('pure-flame')])).toEqual([]);
  });

  it('a shrine row may repeat its tier (it has no stop weight)', () => {
    expect(row('vigor').tiers.every((t) => t.effect.damage === 0.2)).toBe(true);
    expect(stopRowProblems(registry.getBoons().slice(0, 6))).toEqual(
      ['offense', 'element', 'defense', 'tempo', 'fortune', 'pact', 'floor'].map(
        (f) => `no stop boon in ${f}`,
      ),
    );
  });
});
```

- [ ] **Step 2: Run it.** `(cd packages/engine && npx vitest run tests/delve-boons-rows.test.ts --reporter=dot)`. Expected: FAIL (`stopRowProblems` is not exported).

- [ ] **Step 3: Implement.** In `packages/engine/src/data/boons-check.ts`, add to its imports (merging with any existing import from the same module):

```ts
import { BOON_FAMILIES, type BoonDef } from '../types/boon.js';
```

  Append:

```ts
/**
 * The stop rows' checks (the boons spec §1): every family has a row a stop
 * can draw, and no such row's three tiers carry the same effect. A shrine row
 * (no stop weight) copies its tier, so it is left out.
 */
export function stopRowProblems(boons: readonly BoonDef[]): string[] {
  const problems: string[] = [];
  const atStop = boons.filter((b) => b.weight.common + b.weight.rare + b.weight.epic > 0);
  for (const f of BOON_FAMILIES)
    if (!atStop.some((b) => b.family === f)) problems.push(`no stop boon in ${f}`);
  for (const b of atStop) {
    const [first, ...rest] = b.tiers.map((t) => JSON.stringify(t.effect));
    if (rest.every((e) => e === first)) problems.push(`${b.id}: its three tiers are the same`);
  }
  return problems;
}
```

  Append too:

```ts
/** What only a stop boon may carry: knobs and attunement (the boons spec §2a). */
const STOP_ONLY = ['knobs', 'attune'] as const;
/** Fields that shape a floor, never on a floor shrine (it is prayed mid-floor). */
const FLOOR_SHAPING = [
  'exitRevealed',
  'shrinesLastDive',
  'noSlow',
  'hazardsFriendly',
  'skip',
  'eliteChance',
  'noPotions',
] as const;

/**
 * The shrine rows' check (the boons spec §1): a shrine's effect holds only what
 * a shrine or a dive stat can, so never knobs or attunement, and a `floor`
 * shrine never a floor-shaping field. One message a field a row.
 */
export function shrineRowProblems(boons: readonly BoonDef[]): string[] {
  const problems: string[] = [];
  for (const b of boons) {
    if (!b.shrine) continue;
    const fields = new Set(b.tiers.flatMap((t) => Object.keys(t.effect)));
    for (const f of STOP_ONLY) if (fields.has(f)) problems.push(`${b.id}: a shrine can't carry ${f}`);
    if (b.duration === 'floor')
      for (const f of FLOOR_SHAPING)
        if (fields.has(f)) problems.push(`${b.id}: a floor shrine can't carry ${f}`);
  }
  return problems;
}
```

  In `boonsProblems`, immediately before its `return problems;`, add:

```ts
  problems.push(...stopRowProblems(registry.getBoons()), ...shrineRowProblems(registry.getBoons()));
```

  In A's `packages/engine/tests/delve-boons-a-check.test.ts` (its one-row fixtures would now gain seven "no stop boon in <family>" messages), replace:

```ts
const withBoons = (boons: BoonDef[]) => boonsProblems(new DataRegistry({ ...data, boons }));
```

  with:

```ts
/** `boons` plus the shipped stop rows (which add no problem), so only `boons`' own show. */
const withBoons = (boons: BoonDef[]) =>
  boonsProblems(new DataRegistry({ ...data, boons: [...boons, ...data.boons.slice(6)] }));
```

  (`vigor` stays `data.boons[0]`, a shrine row with no stop weight, so none of its exact matchers changes.)

- [ ] **Step 4: Run.** `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-rows.test.ts tests/delve-boons-a-check.test.ts --reporter=dot)`. Expected: PASS. Fingerprint: identical.

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-boons-b1
(cd packages && npx prettier --end-of-line auto --write engine/src/data/boons-check.ts engine/tests/delve-boons-rows.test.ts engine/tests/delve-boons-a-check.test.ts)
git add packages/engine/src/data/boons-check.ts packages/engine/tests/delve-boons-rows.test.ts packages/engine/tests/delve-boons-a-check.test.ts
git commit -m "feat(engine): boons load checks: a stop row in every family, no stop row with three identical tiers, shrine rows within a shrine's fields" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: `rollBoons`

Spec §4's roll: each of `offers` (3) cards draws a tier by the depth's band (the last `tierWeights` entry whose `fromDepth` ≤ the depth), bumped one tier at the door's `boons` chance; then a row by `weight[tier]` among rows with that tier's weight, `minDepth` met, under `cap` in `dive.diveBuffs`, and a family not yet on the offer; an empty tier falls back lower, then higher; none left ends the offer.

**Files:** `packages/engine/src/delve/boons.ts`, `packages/engine/tests/delve-boons-stop.test.ts` (new)

- [ ] **Step 1: Write the failing test.** Create `packages/engine/tests/delve-boons-stop.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { DataRegistry } from '../src/data/registry.js';
import { rollBoons } from '../src/delve/boons.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { BoonDef, BoonOffer, Buff } from '../src/types/boon.js';
import type { DiveState } from '../src/types/delve.js';
import { bal, registry } from './fixtures/arena.js';

// See the boons spec §4: the roll.

type Rolled = Pick<DiveState, 'depth' | 'door' | 'diveBuffs'>;
const at = (depth: number, over: Partial<Rolled> = {}): Rolled => ({
  depth,
  door: null,
  diveBuffs: [],
  ...over,
});
const roll = (dive: Rolled, seed: number, reg: DataRegistry = registry): BoonOffer[] =>
  rollBoons(reg, dive, new SeededRNG(seed).fork(`stop:${dive.depth}`));
const family = (o: BoonOffer) => registry.getBoon(o.id)!.family;
const buff = (id: string, n: number): Buff[] =>
  Array.from({ length: n }, () => ({
    boon: id,
    tier: 1 as const,
    effect: registry.getBoon(id)!.tiers[0].effect,
  }));
/** `registry` with these tier weights at every depth, and optionally these rows. */
function tuned(weights: [number, number, number], rows?: BoonDef[]): DataRegistry {
  const balance = { ...bal, boons: { offers: 3, tierWeights: [{ fromDepth: 1, weights }] } };
  return Object.assign(Object.create(registry) as DataRegistry, {
    getDelveBalance: () => balance,
    ...(rows && { getBoons: () => rows }),
  });
}

describe('rollBoons', () => {
  it('offers three boons of three families, the same for the same seed', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const offers = roll(at(8), seed);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map(family)).size).toBe(3);
      for (const o of offers) expect([1, 2, 3]).toContain(o.tier);
      expect(roll(at(8), seed)).toEqual(offers);
    }
    const seeds = Array.from({ length: 20 }, (_, i) => JSON.stringify(roll(at(8), i + 1)));
    expect(new Set(seeds).size).toBeGreaterThan(10);
  });

  it('never offers a boon worn to its cap', () => {
    const worn = [...buff('keen-edge', 3), ...buff('third-wind', 1), ...buff('magpie', 1)];
    let magpie = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const ids = roll(at(8, { diveBuffs: worn }), seed).map((o) => o.id);
      expect(ids).not.toContain('keen-edge');
      expect(ids).not.toContain('third-wind');
      if (ids.includes('magpie')) magpie++;
    }
    expect(magpie).toBeGreaterThan(0); // under its cap of 2: still offered
  });

  it('offers a boon only from its minDepth', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++)
      for (const o of roll(at(1), seed)) {
        expect(registry.getBoon(o.id)!.minDepth ?? 1).toBeLessThanOrEqual(1);
        seen.add(o.id);
      }
    expect(seen.has('echo')).toBe(false);
    const deep = new Set<string>();
    for (let seed = 1; seed <= 600; seed++) for (const o of roll(at(6), seed)) deep.add(o.id);
    expect(deep.has('blood-price')).toBe(true);
    expect(deep.has('echo')).toBe(true);
  });

  it('draws the tier by the depth band, leaning rarer deeper', () => {
    const epics = (depth: number) => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++)
        n += roll(at(depth), seed).filter((o) => o.tier === 3).length;
      return n;
    };
    expect(epics(40)).toBeGreaterThan(epics(1));
    for (let seed = 1; seed <= 20; seed++)
      expect(roll(at(5), seed, tuned([0, 0, 100])).every((o) => o.tier === 3)).toBe(true);
  });

  it("bumps a card one tier at the door's boons chance; epic stays epic", () => {
    const door = { ...registry.getDoor('gilded'), mods: { boons: 1 } };
    for (let seed = 1; seed <= 20; seed++) {
      expect(roll(at(5, { door }), seed, tuned([100, 0, 0])).every((o) => o.tier === 2)).toBe(
        true,
      );
      expect(roll(at(5, { door }), seed, tuned([0, 0, 100])).every((o) => o.tier === 3)).toBe(
        true,
      );
    }
  });

  it('falls back to a lower tier, then a higher one, when a tier has no row left', () => {
    const only = (weight: BoonDef['weight']) =>
      registry
        .getBoons()
        .filter((b) => b.weight.common > 0)
        .map((b) => ({ ...b, weight }));
    const commons = only({ common: 1, rare: 0, epic: 0 });
    const rares = only({ common: 0, rare: 1, epic: 0 });
    for (let seed = 1; seed <= 20; seed++) {
      expect(roll(at(8), seed, tuned([0, 0, 100], commons)).map((o) => o.tier)).toEqual([1, 1, 1]);
      expect(roll(at(8), seed, tuned([100, 0, 0], rares)).map((o) => o.tier)).toEqual([2, 2, 2]);
    }
  });

  it('ends the offer when no family is left, and offers nothing with no row', () => {
    const two = registry.getBoons().filter((b) => b.id === 'keen-edge' || b.id === 'magpie');
    expect(roll(at(8), 1, tuned([80, 18, 2], two)).map((o) => o.id).sort()).toEqual([
      'keen-edge',
      'magpie',
    ]);
    expect(roll(at(8), 1, tuned([80, 18, 2], registry.getBoons().slice(0, 6)))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it.** `(cd packages/engine && npx vitest run tests/delve-boons-stop.test.ts --reporter=dot)`. Expected: FAIL (`rollBoons` is not exported).

- [ ] **Step 3: Implement.** In `packages/engine/src/delve/boons.ts`, add to the imports (merge with A's existing ones; `boonCount` is already in this file):

```ts
import type { DataRegistry } from '../data/registry.js';
import { weightedPick } from '../loot/item-generator.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import {
  BOON_TIER_NAMES,
  type BoonDef,
  type BoonFamily,
  type BoonOffer,
  type BoonTierIndex,
} from '../types/boon.js';
import type { DiveState } from '../types/delve.js';
```

  Append:

```ts
/** A tier, then the lower ones, then the higher ones (the boons spec §4's fallback). */
const FALLBACK: Record<BoonTierIndex, BoonTierIndex[]> = {
  1: [1, 2, 3],
  2: [2, 1, 3],
  3: [3, 2, 1],
};
const TIERS = [1, 2, 3] as const;

/** A row's stop weight at a tier. */
const weightAt = (b: BoonDef, t: BoonTierIndex) => b.weight[BOON_TIER_NAMES[t - 1]];

/**
 * A stop's boon offer (the boons spec §4), drawn on `rng` (the dive seed's
 * `stop:<depth>` fork): up to `delve.boons.offers` cards, each a tier by the
 * depth's band (the last `tierWeights` entry from at most `dive.depth`), one
 * tier up at the chance of the door that led here (`DoorMods.boons`), then a row
 * by its weight at that tier among those with `minDepth` met, under their `cap`
 * in `dive.diveBuffs`, and of a family not yet offered. A tier with no such row
 * falls back lower, then higher; with none at all the offer ends.
 */
export function rollBoons(
  registry: DataRegistry,
  dive: Pick<DiveState, 'depth' | 'door' | 'diveBuffs'>,
  rng: SeededRNG,
): BoonOffer[] {
  const { offers, tierWeights } = registry.getDelveBalance().boons;
  const band = tierWeights.filter((b) => b.fromDepth <= dive.depth).at(-1) ?? tierWeights[0];
  const bump = dive.door?.mods.boons ?? 0;
  const open = registry
    .getBoons()
    .filter((b) => (b.minDepth ?? 1) <= dive.depth && boonCount(dive.diveBuffs, b.id) < b.cap);
  const families = new Set<BoonFamily>();
  const out: BoonOffer[] = [];
  for (let n = 0; n < offers; n++) {
    let tier: BoonTierIndex = weightedPick(TIERS, (t) => band.weights[t - 1], rng);
    if (rng.next() < bump) tier = Math.min(3, tier + 1) as BoonTierIndex;
    const left = open.filter((b) => !families.has(b.family));
    const t = FALLBACK[tier].find((x) => left.some((b) => weightAt(b, x) > 0));
    if (t === undefined) break;
    const row = weightedPick(
      left.filter((b) => weightAt(b, t) > 0),
      (b) => weightAt(b, t),
      rng,
    );
    families.add(row.family);
    out.push({ id: row.id, tier: t });
  }
  return out;
}
```

- [ ] **Step 4: Run.** `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-stop.test.ts tests/delve-boons-a-sum.test.ts --reporter=dot)`. Expected: PASS. Fingerprint: identical (nothing calls it yet).

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-boons-b1
(cd packages && npx prettier --end-of-line auto --write engine/src/delve/boons.ts engine/tests/delve-boons-stop.test.ts)
git add packages/engine/src/delve/boons.ts packages/engine/tests/delve-boons-stop.test.ts
git commit -m "feat(engine): rollBoons, a stop's three boons by tier, family, cap and depth" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: The stop rolls boons; `takeStop` takes one

`rollStop`: a guided stop as before (`kind: 'powerups'`; a guided step naming no kind still gives no stop); any other stop `rollBoons` on `stop:<depth>`, `kind: 'boons'`, or `null` with no card. `takeStop`'s `boon` action on a `boons` stop pushes `{ boon, tier, effect }` onto `dive.diveBuffs` and marks the stop taken: no pooling, no lock lift, no `banked` spend, no quest or tutorial event. A power-up action on a `boons` stop, and a `boon` action on a `powerups` stop, are refused "Not offered at this stop". The alcoves are untouched (`alcoveOffers`, `takeAlcove`, `pickKinds`, `runStop`). This task changes play.

**Files:** `packages/engine/src/delve/stops.ts`, `packages/engine/tests/delve-stops.test.ts`, `packages/engine/tests/delve-runes.test.ts`, `packages/engine/tests/delve-boons-a-stop.test.ts`

- [ ] **Step 1: Rewrite the stop tests.** In `packages/engine/tests/delve-stops.test.ts`:

  Add to the imports:

```ts
import { alcoveOffers } from '../src/delve/stops.js';
import type { BoonOffer } from '../src/types/boon.js';
import { onMap, twoRooms } from './fixtures/flow-map.js';
```

  (merge `alcoveOffers` into the existing `../src/delve/stops.js` import line). Below `const FOUR …`, add:

```ts
/** A boons stop offering `offers`. */
const boonsStop = (...offers: BoonOffer[]): DiveStop => ({ kind: 'boons', offers, taken: false });
const OFFER: BoonOffer[] = [
  { id: 'keen-edge', tier: 2 },
  { id: 'stone-skin', tier: 1 },
  { id: 'magpie', tier: 3 },
];
const st = (step: string) => ({ step, count: 0, misses: 0 });
```

  Replace the whole `it('holds 2 or 3 of the kinds that apply, the same from the same dive', …)` block with:

```ts
  it('an ordinary stop holds three boons, the same from the same dive', () => {
    const p = startDive(registry, { ...hero(), scrap: 1000, manaDust: 50 }, 1);
    const clear = () => {
      const world = beginFloor(registry, p);
      const ctx = makeCtx(registry, world, []);
      for (const m of [...world.monsters]) hitMonster(ctx, m, 1e12, null, { source: 'skill' });
      run(world, 5);
      return completeFloor(registry, p, world).profile;
    };
    const once = clear();
    expect(once.dive!.phase).toBe('choosing');
    const stop = once.dive!.stop!;
    expect(stop.kind).toBe('boons');
    expect(stop.taken).toBe(false);
    expect(stop.offers).toHaveLength(3);
    expect(clear().dive!.stop).toEqual(stop);
  });
```

  In the `it('offers only what the hero can take and pay for: …')` block, replace the line:

```ts
    expect(rollStop(registry, spent, startDive(registry, spent, 1).dive!)).toBeNull();
```

  with:

```ts
    // A hero with nothing to pay still meets boons: they are free.
    expect(rollStop(registry, spent, startDive(registry, spent, 1).dive!)?.kind).toBe('boons');
```

  Replace the whole `it('offers 2 or 3 at random in the kinds order, all of them when only two apply', …)` block (whatever A left in it) with:

```ts
  it('a guided stop offers the power-ups its step names, required; a step naming none, no stop', () => {
    const dive = startDive(registry, hero(), 1).dive!;
    expect(rollStop(registry, { ...hero(), tutorial: st('s1-equip') }, dive)).toEqual({
      kind: 'powerups',
      offers: ['equip'],
      taken: false,
      required: true,
    });
    expect(rollStop(registry, { ...hero(), tutorial: st('s3-home') }, dive)).toBeNull();
    const guided = {
      ...atStop(hero(), { kind: 'powerups', offers: ['equip'], taken: false, required: true }),
      tutorial: st('s1-equip'),
    };
    const res = takeStop(registry, guided, { kind: 'equip', uid: 'r1' });
    expect(res.ok).toBe(true);
    expect(res.profile.equipped.ring!.uid).toBe('r1');
    expect(takeStop(registry, guided, { kind: 'boon', index: 0 }).reason).toBe(
      'Not offered at this stop',
    );
  });

  it('an anvil alcove still offers 2 or 3 paid power-ups', () => {
    const p = startDive(registry, { ...hero(), scrap: 1000 }, 1);
    const w = onMap(beginFloor(registry, p), twoRooms('alcove', { kind: 'alcove' }, 1));
    const offers = alcoveOffers(registry, p, w, '1:1');
    expect(offers.length).toBeGreaterThanOrEqual(2);
    for (const k of offers) expect(STOP_KINDS).toContain(k);
  });
```

  At the end of the `describe('takeStop', …)` block (before its closing `});`), append:

```ts
  it("takes a boon: its tier's effect onto the dive, free, the stop taken", () => {
    const p = { ...atStop(hero(), boonsStop(...OFFER)), scrap: 77, links: 2 };
    const res = takeStop(registry, p, { kind: 'boon', index: 2 });
    expect(res.ok).toBe(true);
    expect(res.profile.dive!.diveBuffs).toEqual([
      ...p.dive!.diveBuffs,
      { boon: 'magpie', tier: 3, effect: { find: 60 } },
    ]);
    expect(res.profile.dive!.stop).toEqual({ ...p.dive!.stop, taken: true });
    // Nothing spent, banked or otherwise changed.
    expect({ ...res.profile, dive: null }).toEqual({ ...p, dive: null });
    expect({ ...res.profile.dive!, diveBuffs: [], stop: null }).toEqual({
      ...p.dive!,
      diveBuffs: [],
      stop: null,
    });
    expect(takeStop(registry, res.profile, { kind: 'boon', index: 0 }).reason).toBe(
      "This stop's boon is taken",
    );
  });

  it('refuses a card it does not hold, a power-up at a boons stop, and a boon at a power-up stop', () => {
    const p = atStop(hero(), boonsStop(...OFFER));
    for (const index of [3, -1, 0.5])
      expect(takeStop(registry, p, { kind: 'boon', index })).toMatchObject({
        ok: false,
        reason: 'Take a boon the stop offers',
        profile: p,
      });
    expect(takeStop(registry, p, { kind: 'equip', uid: 'r1' }).reason).toBe(
      'Not offered at this stop',
    );
    expect(takeStop(registry, atStop(hero(), ALL), { kind: 'boon', index: 0 }).reason).toBe(
      'Not offered at this stop',
    );
    expect(takeStop(registry, startDive(registry, hero(), 1), { kind: 'boon', index: 0 }).reason).toBe(
      'No stop here',
    );
  });

  it('stacks: a second stop adds a second entry of the same boon', () => {
    const one = takeStop(registry, atStop(hero(), boonsStop(...OFFER)), { kind: 'boon', index: 0 })
      .profile;
    const again = { ...one, dive: { ...one.dive!, stop: boonsStop({ id: 'keen-edge', tier: 1 }) } };
    const two = takeStop(registry, again, { kind: 'boon', index: 0 }).profile;
    expect(two.dive!.diveBuffs.map((b) => [b.boon, b.tier])).toEqual([
      ['keen-edge', 2],
      ['keen-edge', 1],
    ]);
  });

  it('the save keeps a boons stop and the boons worn', () => {
    const p = takeStop(registry, atStop(hero(), boonsStop(...OFFER)), { kind: 'boon', index: 1 })
      .profile;
    const json = (x: unknown) => JSON.parse(JSON.stringify(x));
    const back = parseDelveProfile(registry, json(p))!.profile.dive!;
    expect(back.stop).toEqual(p.dive!.stop);
    expect(back.diveBuffs).toEqual(p.dive!.diveBuffs);
  });
```

  In A's `packages/engine/tests/delve-boons-a-stop.test.ts`: delete the whole `it("rolls a 'powerups' stop", …)` block (an ordinary stop now rolls boons; `delve-stops.test.ts` covers both kinds). Replace:

```ts
  it("refuses a boon on either kind of stop, and a power-up on a 'boons' stop", () => {
    const refused = { ok: false, reason: 'Not offered at this stop' };
    const powerups = atStop(hero(), { kind: 'powerups', offers: ['equip'], taken: false });
    expect(takeStop(registry, powerups, { kind: 'boon', index: 0 })).toMatchObject(refused);
    const boons = atStop(hero(), BOONS);
    expect(takeStop(registry, boons, { kind: 'boon', index: 0 })).toMatchObject(refused);
```

  with:

```ts
  it("refuses a boon on a 'powerups' stop and a power-up on a 'boons' stop; takes a boon there", () => {
    const refused = { ok: false, reason: 'Not offered at this stop' };
    const powerups = atStop(hero(), { kind: 'powerups', offers: ['equip'], taken: false });
    expect(takeStop(registry, powerups, { kind: 'boon', index: 0 })).toMatchObject(refused);
    const boons = atStop(hero(), BOONS);
    expect(takeStop(registry, boons, { kind: 'boon', index: 0 }).ok).toBe(true);
```

  If `rollStop` is then unused in that file, drop it from its import.

- [ ] **Step 2: Delete the old power-up pin.** In `packages/engine/tests/delve-runes.test.ts`, delete the whole `it('rolls every stop as it did when the rune kind does not apply', …)` block (an ordinary stop no longer draws kinds; the 2-or-3 draw is the alcoves', pinned by `delve-maps-flow.test.ts`'s "the anvil alcove"). Remove any import that leaves unused (`rollStop` there, if nothing else uses it).

- [ ] **Step 3: Run them.** `(cd packages/engine && npx vitest run tests/delve-stops.test.ts --reporter=dot)`. Expected: FAIL: the ordinary-stop test (`kind` is `'powerups'`), the boon take ("Not offered at this stop" where `ok` is expected), the refusal reasons.

- [ ] **Step 4: Implement.** In `packages/engine/src/delve/stops.ts`:

  Add to the imports:

```ts
import type { Buff } from '../types/boon.js';
import { rollBoons } from './boons.js';
```

  Replace the module comment's first sentence block:

```ts
 * Stops between depths (see the weapon movesets spec): after a depth is
 * cleared, the door screen holds one power-up, taken with the dive lock lifted
 * for that one op. dive.ts imports this module back: keep to function declarations.
```

  with:

```ts
 * Stops between depths: after a depth is cleared, an ordinary stop offers three
 * boons, one taken free (the boons spec §4); a guided stop and an anvil alcove
 * hold power-ups, each taken with the dive lock lifted for that one op (the
 * weapon movesets spec). dive.ts imports this module back: keep to function declarations.
```

  Replace the whole `rollStop` function (its doc comment included) with:

```ts
/**
 * The stop after `dive`'s depth is cleared (`completeFloor`). A guided stop
 * (the profile's current step a stop step) offers the kinds its step names that
 * apply, all of them, required before a door when its step waits for the
 * power-up (`takeStop`; see the tutorial spec's gates), and none apply, no stop.
 * Any other stop offers boons (`rollBoons`, on the dive seed's fork
 * `stop:<depth>`); none left, no stop.
 */
export function rollStop(
  registry: DataRegistry,
  profile: DelveProfile,
  dive: DiveState,
): DiveStop | null {
  const step = tutorialStep(registry, profile.tutorial);
  if (step?.stop) {
    const kinds = stopKinds(registry, { ...profile, dive });
    const offers = kinds.filter((k) => step.stop!.kinds.includes(k));
    if (offers.length === 0) return null;
    return { kind: 'powerups', offers, taken: false, required: step.trigger.type === 'takeStop' };
  }
  const offers = rollBoons(registry, dive, new SeededRNG(dive.seed).fork(`stop:${dive.depth}`));
  return offers.length > 0 ? { kind: 'boons', offers, taken: false } : null;
}
```

  Replace `takeStop`'s doc comment and its opening checks — from `* Take the stop's power-up: its kind must be offered and the stop not yet` through the line `return { ok: false, profile, reason: 'Not offered at this stop' };` (A's version of those lines, whatever their exact narrowing) — with:

```ts
 * Take what the stop offers. At a boons stop, the offer at `index`: its tier's
 * effect goes onto the dive (`DiveState.diveBuffs`) and the stop is taken, free
 * (nothing pooled, spent or locked; no quest or tutorial event). At a power-up
 * stop, the kind must be offered and the stop not yet taken. The op runs at
 * its normal price with the dive lock lifted for it alone (equipping is free,
 * and a weapon brings its own moveset); `move` changes one move of one chain
 * (its sockets and runes stay as saved); `rune` sockets a pouch rune into an
 * empty socket, free. It spends what the dive has banked first, then the
 * stockpile (so a rune found this dive can be socketed). A refused op leaves
 * the stop open; one taken marks it taken. Skipping is choosing a door.
 */
export function takeStop(
  registry: DataRegistry,
  profile: DelveProfile,
  action: StopAction,
): ProfileActionResult {
  const dive = profile.dive;
  const stop = dive?.phase === 'choosing' && !dive.settled ? dive.stop : null;
  if (!dive || !stop) return { ok: false, profile, reason: 'No stop here' };
  if (stop.kind === 'boons') {
    if (action.kind !== 'boon') return { ok: false, profile, reason: 'Not offered at this stop' };
    if (stop.taken) return { ok: false, profile, reason: "This stop's boon is taken" };
    const offer = stop.offers[action.index];
    const def = offer && registry.getBoon(offer.id);
    if (!offer || !def) return { ok: false, profile, reason: 'Take a boon the stop offers' };
    const buff: Buff = {
      boon: offer.id,
      tier: offer.tier,
      effect: def.tiers[offer.tier - 1].effect,
    };
    const taken = { ...dive, diveBuffs: [...dive.diveBuffs, buff], stop: { ...stop, taken: true } };
    return { ok: true, profile: { ...profile, dive: taken } };
  }
  if (stop.taken) return { ok: false, profile, reason: "This stop's power-up is taken" };
  if (action.kind === 'boon' || !stop.offers.includes(action.kind))
    return { ok: false, profile, reason: 'Not offered at this stop' };
```

  The rest of `takeStop` (from `const res = runStop(…)` on) stays as A left it; `action` is narrowed to a power-up action there.

- [ ] **Step 5: Run.** `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-stops.test.ts tests/delve-boons-a-stop.test.ts tests/delve-runes.test.ts tests/delve-maps-flow.test.ts tests/delve-banking.test.ts tests/delve-dive.test.ts tests/delve-tutorial-runner-dive.test.ts tests/delve-tutorial-runner-script.test.ts tests/delve-quests-emission.test.ts --reporter=dot)`. Expected: PASS. If a test in the last five fails because it read an ordinary stop's power-ups through the real `completeFloor`, it is in this area's reach only if it's a stop assertion: fix it to a `boons` stop; anything else goes in the handover. No fingerprint from here on (retired: see Base).

- [ ] **Step 6: Commit.**

```bash
cd /c/Projects/alloy-boons-b1
(cd packages && npx prettier --end-of-line auto --write engine/src/delve/stops.ts engine/tests/delve-stops.test.ts engine/tests/delve-runes.test.ts engine/tests/delve-boons-a-stop.test.ts)
git add packages/engine/src/delve/stops.ts packages/engine/tests/delve-stops.test.ts packages/engine/tests/delve-runes.test.ts packages/engine/tests/delve-boons-a-stop.test.ts
git commit -m "feat(engine): ordinary stops offer three boons; takeStop takes one, free" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: The bot takes a boon

Spec §5: on a `boons` stop the highest tier, ties by family offense, defense, element, tempo, fortune, floor; never a pact. A `powerups` stop keeps the old ladder; `takeBestAlcove` and `takeGuidedStop` are unchanged.

**Files:** `packages/engine/src/delve/autopilot.ts`, `packages/engine/tests/delve-stops.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/delve-stops.test.ts`, at the end of `describe('the autopilot at a stop', …)` (before its closing `});`), append:

```ts
  it('takes the boon of the highest tier, ties by family, never a pact', () => {
    const took = (...offers: BoonOffer[]) =>
      takeBestStop(registry, atStop(hero(), boonsStop(...offers))).dive!.diveBuffs.map(
        (b) => `${b.boon}:${b.tier}`,
      );
    expect(
      took({ id: 'keen-edge', tier: 1 }, { id: 'glass-cannon', tier: 3 }, { id: 'stone-skin', tier: 2 }),
    ).toEqual(['stone-skin:2']);
    expect(
      took({ id: 'magpie', tier: 2 }, { id: 'bulwark', tier: 2 }, { id: 'keen-edge', tier: 1 }),
    ).toEqual(['bulwark:2']);
    expect(
      took({ id: 'cartographer', tier: 1 }, { id: 'magpie', tier: 1 }, { id: 'echo', tier: 1 }),
    ).toEqual(['echo:1']);
    expect(took({ id: 'pure-flame', tier: 1 }, { id: 'keen-edge', tier: 1 })).toEqual([
      'keen-edge:1',
    ]);
    const pacts = atStop(hero(), boonsStop({ id: 'glass-cannon', tier: 3 }, { id: 'hunted', tier: 1 }));
    expect(takeBestStop(registry, pacts)).toBe(pacts);
    const taken = { ...atStop(hero(), boonsStop(...OFFER)) };
    taken.dive = { ...taken.dive!, stop: { ...taken.dive!.stop!, taken: true } };
    expect(takeBestStop(registry, taken)).toBe(taken);
  });
```

- [ ] **Step 2: Run it.** `(cd packages/engine && npx vitest run tests/delve-stops.test.ts --reporter=dot)`. Expected: FAIL (the bot takes nothing at a boons stop: `[]`).

- [ ] **Step 3: Implement.** In `packages/engine/src/delve/autopilot.ts` (hand-edit; never formatted), add to the imports:

```ts
import type { BoonFamily } from '../types/boon.js';
```

  Replace:

```ts
/**
 * At a stop between depths, by preference: equip the bag item that beats its
 * gear the most as it is; else socket the pouch rune that raises Power most
 * into an empty socket (free); else upgrade its cheapest affordable equipped
 * item; else add an affordable slot (in `SLOT_ORDER`); else skip (the door).
 */
export function takeBestStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  return bestStop(registry, profile, (action) => {
```

  with:

```ts
/** A boons stop's tie-break by family (the boons spec §5); a pact is never taken. */
const BOON_ORDER: readonly BoonFamily[] = ['offense', 'defense', 'element', 'tempo', 'fortune', 'floor'];

/**
 * At a stop between depths. A boons stop: the boon of the highest tier, ties by
 * family in `BOON_ORDER`, never a pact (nothing taken when only pacts are
 * offered). A power-up stop, by preference: equip the bag item that beats its
 * gear the most as it is; else socket the pouch rune that raises Power most
 * into an empty socket (free); else upgrade its cheapest affordable equipped
 * item; else add an affordable slot (in `SLOT_ORDER`); else skip (the door).
 */
export function takeBestStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const stop = profile.dive?.stop;
  if (stop?.kind === 'boons') {
    if (stop.taken) return profile;
    const best = stop.offers
      .map((o, index) => ({ index, tier: o.tier, order: BOON_ORDER.indexOf(registry.getBoon(o.id)!.family) }))
      .filter((o) => o.order >= 0)
      .sort((a, b) => b.tier - a.tier || a.order - b.order)[0];
    const res = best && takeStop(registry, profile, { kind: 'boon', index: best.index });
    return res?.ok ? res.profile : profile;
  }
  return bestStop(registry, profile, (action) => {
```

- [ ] **Step 4: Run.** `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-stops.test.ts tests/delve-autopilot-crafting.test.ts tests/delve-maps-bot.test.ts tests/delve-tutorial-bot.test.ts --reporter=dot)`. Expected: PASS (the last is long; the guided start's stops are `powerups`, so it should hold — if it fails, it goes to the handover, not tuned here).

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-boons-b1
(cd packages && npx prettier --end-of-line auto --write engine/tests/delve-stops.test.ts)
git add packages/engine/src/delve/autopilot.ts packages/engine/tests/delve-stops.test.ts
git commit -m "feat(engine): the autopilot takes a stop's boon: highest tier, family order, never a pact" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: `economySim` counts the boons taken

`EconomyDive.boons: Record<BoonFamily, number>`, every family present, the stop boons the bot took that dive (the entries a stop pushed onto `diveBuffs`; a shrine's Devotion is a floor's, not counted). `stops` stays: now the guided stops' spend only (an alcove's spend happens inside `playFloor`, outside the stop's `outflow`).

**Files:** `packages/engine/src/delve/economy.ts`, `packages/engine/src/delve/autopilot.ts`, `packages/engine/tests/delve-boons-stop.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/delve-boons-stop.test.ts`, add to the imports:

```ts
import { economySim } from '../src/delve/economy.js';
import { BOON_FAMILIES } from '../src/types/boon.js';
```

  Append:

```ts
describe("economySim's boons", () => {
  it('counts the boons each dive took by family, every family, never a pact', () => {
    const report = economySim(registry, 1, 2);
    let total = 0;
    for (const d of report.dives) {
      expect(Object.keys(d.boons)).toEqual([...BOON_FAMILIES]);
      expect(d.boons.pact).toBe(0);
      for (const n of Object.values(d.boons)) expect(Number.isInteger(n) && n >= 0).toBe(true);
      total += Object.values(d.boons).reduce((a, b) => a + b, 0);
    }
    expect(total).toBeGreaterThan(0); // seed 1 clears depths in its first dives
    expect(structuredClone(report.dives)).toEqual(report.dives);
  }, 30000);
});
```

- [ ] **Step 2: Run it.** `(cd packages/engine && npx vitest run tests/delve-boons-stop.test.ts --reporter=dot)`. Expected: FAIL (`d.boons` is undefined).

- [ ] **Step 3: Implement.** In `packages/engine/src/delve/economy.ts`, add to the imports:

```ts
import type { BoonFamily } from '../types/boon.js';
```

  Replace:

```ts
  /** What the stops spent from the stockpile during the dive (beyond what the dive had banked). */
  stops: Haul;
```

  (the one inside `interface EconomyDive`) with:

```ts
  /** What the guided stops spent from the stockpile during the dive (beyond what the dive had banked); an ordinary stop's boon is free. */
  stops: Haul;
  /** The boons the stops gave this dive, by family (every family, 0 where none). */
  boons: Record<BoonFamily, number>;
```

  In `packages/engine/src/delve/autopilot.ts`, extend the boon import from Task 5 to:

```ts
import { BOON_FAMILIES, type BoonFamily } from '../types/boon.js';
```

  In `runAutopilot`, replace:

```ts
    let stops = emptyHaul();
```

  with:

```ts
    let stops = emptyHaul();
    const boons = Object.fromEntries(BOON_FAMILIES.map((f) => [f, 0])) as Record<BoonFamily, number>;
```

  Replace:

```ts
      stops = addHaul(stops, outflow(before, p));
```

  with:

```ts
      stops = addHaul(stops, outflow(before, p));
      for (const b of p.dive!.diveBuffs.slice(before.dive!.diveBuffs.length))
        boons[registry.getBoon(b.boon)!.family]++;
```

  Replace:

```ts
      stops,
      lost: dive.lost,
```

  with:

```ts
      stops,
      boons,
      lost: dive.lost,
```

  (`economySim` spreads each row, so `EconomyRow` carries it with no change there.)

- [ ] **Step 4: Run.** `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-stop.test.ts tests/delve-autopilot-crafting.test.ts tests/delve-crafting-contract.test.ts --reporter=dot)`. Expected: PASS (`delve-autopilot-crafting`'s first test can time out on a loaded machine; rerun it alone before calling it a regression).

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-boons-b1
(cd packages && npx prettier --end-of-line auto --write engine/src/delve/economy.ts engine/tests/delve-boons-stop.test.ts)
git add packages/engine/src/delve/economy.ts packages/engine/src/delve/autopilot.ts packages/engine/tests/delve-boons-stop.test.ts
git commit -m "feat(engine): economySim counts each dive's boons by family" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 7: The Economy view's boons

A "Boons by family" chart choice (one line a family, `PALETTE` colours in `BOON_FAMILIES` order) and a last table column, "Boons (offense to floor)", each family's mean joined by " · ". The column goes last so the existing cells keep their places.

**Files:** `packages/client/src/features/delve/lab/economy-model.ts`, `EconomyView.tsx`, `__tests__/economy-model.test.ts`, `__tests__/EconomyView.test.tsx`

- [ ] **Step 1: Rebuild the engine.** `(cd packages/engine && npx tsup)`. Expected: three "Build success" lines.

- [ ] **Step 2: Write the failing tests.** In `__tests__/economy-model.test.ts`, below `const NONE = …`, add:

```ts
const NO_BOONS = {
  offense: 0,
  element: 0,
  defense: 0,
  tempo: 0,
  fortune: 0,
  pact: 0,
  floor: 0,
};
```

  In `dive()`'s returned object, after `stops: haul(),` add `boons: NO_BOONS,`. Append inside `describe('the Economy view model', …)`:

```ts
  it('draws the boons taken, a line a family', () => {
    const r: EconomyReport = {
      seed: 1,
      dives: [dive(1, { boons: { ...NO_BOONS, offense: 2, floor: 1 } }), dive(2)],
      profile: PROFILE,
    };
    const lines = economyLines([r], 'boons');
    expect(lines.map((l) => [l.label, l.values])).toEqual([
      ['Offense', [2, 0]],
      ['Element', [0, 0]],
      ['Defense', [0, 0]],
      ['Tempo', [0, 0]],
      ['Fortune', [0, 0]],
      ['Pact', [0, 0]],
      ['Floor', [1, 0]],
    ]);
    expect(new Set(lines.map((l) => l.color)).size).toBe(7);
  });
```

  In `__tests__/EconomyView.test.tsx`, in `report()`'s dive object, after `stops: emptyHaul(),` add:

```ts
        boons: { offense: seed, element: 0, defense: 1, tempo: 0, fortune: 0, pact: 0, floor: 0 },
```

  In the first test, after the `cells(rows[2]).slice(0, 5)` assertion, add:

```ts
    // The last column: the boons by family, offense to floor, means over the seeds.
    expect(cells(rows[0]).at(-1)).toBe('7.5 · 0 · 1 · 0 · 0 · 0 · 0');
    expect(screen.getByTestId('economy-table')).toHaveTextContent('Boons (offense to floor)');
```

  In the "charts a material's…" test, before the `'deaths'` change, add:

```ts
    fireEvent.change(show, { target: { value: 'boons' } });
    expect(screen.getAllByTestId('economy-line')).toHaveLength(7);
    expect(screen.getByTestId('economy-legend')).toHaveTextContent('Offense');
```

- [ ] **Step 3: Run them.** `(cd packages/client && npx vitest run src/features/delve/lab --reporter=dot)`. Expected: FAIL (no `'boons'` lines; no column).

- [ ] **Step 4: Implement.** In `economy-model.ts`, add `BOON_FAMILIES` to the `@alloy/engine` import. Update `economyLines`' doc comment's list to read "…the items forged by rarity (`'forged'`), the boons taken by family (`'boons'`), the deepest depth…", and before `if (show === 'depth')` add:

```ts
  if (show === 'boons')
    return BOON_FAMILIES.map((f, i) => ({
      key: `boons:${f}`,
      label: f[0].toUpperCase() + f.slice(1),
      color: PALETTE[i % PALETTE.length],
      values: perDive(reports, (d) => d.boons[f]),
    }));
```

  In `EconomyView.tsx`, add `BOON_FAMILIES` to the `@alloy/engine` import. In `OTHER_CHARTS`, after the `forged` entry, add:

```ts
  { id: 'boons', label: 'Boons by family' },
```

  After `const forged = …;` add:

```ts
  const boons = BOON_FAMILIES.map((f) => perDive(reports, (d) => d.boons[f]));
```

  After the `MATERIAL_TOTALS.map(…)` header cells (before `</tr>` in `<thead>`), add:

```tsx
                  <th className={HEAD}>Boons (offense to floor)</th>
```

  After the `materials.map(…)` body cells (before the row's `</tr>`), add:

```tsx
                    <td className="px-1">{boons.map((b) => formatAmount(b[i])).join(' · ')}</td>
```

  In the component's doc comment, add "the boons taken by family" to the chart's list.

- [ ] **Step 5: Run.** `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/lab --reporter=dot)`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
cd /c/Projects/alloy-boons-b1
(cd packages/client && npx prettier --end-of-line auto --write src/features/delve/lab/economy-model.ts src/features/delve/lab/EconomyView.tsx src/features/delve/lab/__tests__/economy-model.test.ts src/features/delve/lab/__tests__/EconomyView.test.tsx)
git add packages/client/src/features/delve/lab
git commit -m "feat(client): the Economy view charts and tables the boons taken by family" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 8: Close the area

- [ ] **Step 1: The whole engine suite.** `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run --reporter=dot)`. Expected: everything passes but, possibly, the pacing-sensitive files under "Needs routed → D". Don't tune or mark them: list each failing test's name and its measured number in the handover.
- [ ] **Step 2: The client suite.** `(cd packages/engine && npx tsup) && (cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)`. Expected: PASS, but client tests that reach a stop through the real `completeFloor` and expect power-up cards (C1's to rewrite; list them).
- [ ] **Step 3: Handover.** No commit. Report: the commits, the suite counts, the failing pacing-sensitive tests with numbers, and any assumption about A that didn't hold. (No fingerprint: retired from Task 4; D re-baselines.)

---

## Needs routed

- **A (assumptions, see the list above).** If `boonsProblems` already refuses a family with no stop row, A's shipped data could not have loaded (the shrine rows carry no stop weight): B1's Task 2 is where it belongs. `rollBoons` reads only `getBoons()` and `getDelveBalance().boons`; `takeStop` reads `getBoon(id)` (undefined-safe). `rollBoons` is not exported from `src/index.ts` (nothing in the client calls it); add it there if C1 wants a preview.
- **B3 (`dive.ts`, the boons' world fields).** Every Deeper Still entry carries `skip` as a plain number (1, 2, 2); B3's `chooseDoor` consumes it. Hunted's `eliteChance: 1`, `gear`, `scrap`; Famine's `noPotions`; Cartographer's `exitRevealed`; Insurance's `deathLoss` (0.1 = 10 points off 0.4) are inert until B3 merges.
- **B2 (combat fields).** Every stop row's combat field is in B2's units as the contract states: `lowLife.mult` and `nearFoes.per` and `freeCast.damage` and `byKind.*` and `firstMove` are added fractions (+40% = 0.4); `lastStand.reduce` the fraction taken off; `dodgeCharges` may be −1 (No Retreat); Swift Hands is `knobs.quick.cooldown` 0.92/0.88/0.82 with no `power`; Echo is `knobs.echo`.
- **C1 (the stop screen).** An ordinary stop is now `kind: 'boons'` with `offers: BoonOffer[]`; take with `{ kind: 'boon', index }`. Refusal texts: "This stop's boon is taken", "Take a boon the stop offers", "Not offered at this stop". `doorTerms` should name `mods.boons` as a gain (Gilded Halls 0.5, Champion's Den 0.3; the door rows' `text` was left alone). Client tests that reach a stop through the real `completeFloor` now see boons. The boon ids are the overview's (`keen-edge` …).
- **C2 (the HUD).** A taken stop boon is a plain `Buff` on `dive.diveBuffs`, one entry per take (a stack is repeated entries, each with its own tier).
- **D (pacing, E2E, docs).** Ordinary stops no longer spend scrap, Links, Dust or runes and no longer equip, upgrade, slot or socket mid-dive, and the bot gains a boon at every stop, so pacing moves. Likely to move: `delve-pacing.test.ts` (the depth rails, the floor-time bands and ratios, the first epic, the legendary-follows-essence, the kit-and-dive-1 magic forge target, since the stockpile no longer pays stops), `delve-pacing-robust.test.ts`, `delve-pacing-pairs.test.ts` (forced pairs at dive 4; Pure Flame and Second Flame tilt pairs), `delve-pair.test.ts` "binds a given secondary… finds their reaction" (one seeded dive; its comment cites a weapon equipped at a stop, which no longer happens), `delve-autopilot-crafting.test.ts`'s `economySim` tests (structural, but slower runs: watch the 20 s timeout). Expected to hold: `delve-tutorial-bot.test.ts` (guided stops keep power-ups), `delve-maps-sweep.test.ts` (no stops), `delve-awaken-bot.test.ts` (`dives: 0`), `delve-banking.test.ts`'s seed-3 gear floor (the first floor precedes any stop). E2E: any spec that takes a stop's power-up on an ordinary stop (`toRoad` in `e2e/fixtures/delve.ts`, PN06, the stop specs); `delve-tutorial.spec.ts` unchanged. The fingerprint is retired from B1's Task 4: D re-baselines it after B2 and B3 merge. CLAUDE.md's stop paragraphs (Weapon movesets' "a **stop**…", the autopilot's "takes each stop (`takeBestStop`)", the crafting spec's "The stop's power-ups spend…", the Economy view's columns) need the boons wording.
