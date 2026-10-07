# Delve boons · B2: combat fields (engine) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every combat field of the boons spec's §2 table gets its one handler at its site: `maxLife`, `tempo`, `lifesteal` and Blood Price's regen in `applyBuffs`; `byKind`, `firstMove`, `stepBonus`, `lowLife` and `nearFoes` on the damage path; `dodgeCharges`, `dodgeWindow`, `dodgeRecharge` and `perfectAlways` in the dodge; `freeCast` and `bloodPrice` in the payment; `defendDuration` on the Defensive; `lastStand` in `hurtHero`; and the `stackTime` knob in `applyStacks`. Each handler reads the hero's `BoonSum` (`world.hero.boon`, Phase A's) or its stats. With no boon worn every factor is exactly 1 (or + 0), so **nothing moves**: the whole-autopilot fingerprint is identical after every task.

**Architecture:** No new module. Each field is a few lines where its number is already used. The sim reads `h.boon` (A keeps it current); the stats fields go through `applyBuffs`, which keeps its per-entry products and its two passes (dive, then floor). Three small exported helpers carry a rule more than one site needs: `boonPower` (`impact.ts`: a move's or blow's kind and first-move factor), `dodgeMax` / `dodgeRecharge` (`dodge.ts`: the engine and the HUD), `lifeCost` (`cast.ts`: Blood Price's life). Four optional `HeroEntity` fields hold the per-floor state (`freeCastUntil`, `lastStandUsed`, `lastStandUntil`, and the wind-up's `free`), optional so `createHeroEntity` (`world.ts`, B3's) needs no edit for them.

**Tech Stack:** TypeScript 5.7, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-06-delve-boons-design.md` §2 (the effect table and the stacking rule), §2a (`stackTime`), §3 (the numbers the tests borrow), §7 (one short test per field). The contract is `00-overview.md` "The contract".

---

## Base

- **Starts from:** `boons/main` with Phase A merged, in this area's worktree:

```bash
cd /c/Projects/Alloy
git worktree add ../alloy-boons-b2 -b boons/b2 boons/main
```

  Every path below is relative to `/c/Projects/alloy-boons-b2`. Every command block starts there.
- **Anchors:** the edits were written against `main` at `d3b5e447` plus the contract as `00-overview.md` states it (Phase A was drafted in parallel). A touches `resolve.ts` (its `boonKnobs` append), `hero-stats.ts` (`computeHeroStats`) and `basic.ts` (the `echo` flag on hits), never the lines below; if an anchor doesn't match, find the same statement and apply the same change.
- **What A gives this plan** (relied on, not built here): `HeroEntity.boon: BoonSum`, set on every hero (`createHeroEntity`, the sandbox's and the DPS Lab's too) and kept current as buffs change; `buffSum` in `src/delve/boons.ts`; `Buff = { boon, tier, effect }` and `BoonEffect`, `BoonSum` in `src/types/boon.ts`; `Knobs.stackTime` (0 in `NEUTRAL`, additive in `mergeKnobs`). `buffSum`'s combining (sums, products, the largest) is A's; B2 reads the result.
- **Before Task 1:** build once and measure the two suites you'll keep green:

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

  Expected: tsup's "Build success" lines, no type errors, every test passing but the base's 2 known `delve-pacing-robust` failures (A measured 1739 passed / 2 failed / 5 skipped after the contract); write down the counts, each task below adds its own.
- **The fingerprint, before.** Phase A's probe (`01-contract.md`, "The fingerprint"); if you don't have it, it is this file, saved in your session's scratchpad (`$P` below) as `boons-b2-probe.test.ts`, never committed:

```ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot, type AutopilotOptions } from '../src/delve/autopilot.js';

// Scratch parity probe: a fingerprint of whole autopilot runs (every floor's sim), the save's
// version left out.
it('probe', () => {
  const registry = createDefaultRegistry();
  const runs: Record<string, AutopilotOptions> = {};
  for (const primary of ['fire', 'frost', 'earth'] as const)
    for (const seed of [1, 2]) runs[`${primary}:${seed}`] = { seed, dives: 4, primary };
  runs['beeline:3'] = { seed: 3, dives: 4, primary: 'storm', policy: 'beeline' };
  runs['tutorial:1'] = { seed: 1, dives: 3, primary: 'fire', tutorial: true };
  const out: Record<string, string> = {};
  for (const [k, opts] of Object.entries(runs)) {
    const r = runAutopilot(registry, opts);
    const { version: _v, ...rest } = r.profile as unknown as Record<string, unknown>;
    out[k] =
      createHash('sha1').update(JSON.stringify(r.reports) + JSON.stringify(r.economy) + JSON.stringify(rest)).digest('hex') +
      ' ' + r.reports.map((x) => `${x.endDepth}/${x.kills}/${x.floorSeconds.toFixed(3)}`).join(',');
  }
  writeFileSync(process.env.PROBE_OUT!, JSON.stringify(out, null, 1));
}, 900000);
```

```bash
cd /c/Projects/alloy-boons-b2
P=<your scratchpad>
cp $P/boons-b2-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/boons-b2-before.json npx vitest run tests/zz-probe.test.ts)
rm packages/engine/tests/zz-probe.test.ts
```

  The **fingerprint check** is the same three commands writing `boons-b2-after.json`, then `cmp $P/boons-b2-before.json $P/boons-b2-after.json` printing nothing. Every task ends with it: no boon is worn on an autopilot run until B1 lands, so no task may move a number.

## Files

| File | Change |
|---|---|
| `packages/engine/src/delve/hero-stats.ts` | `applyBuffs`: `maxLife`, `tempo`, `lifesteal`, Blood Price's regen (Task 1) |
| `packages/engine/src/arpg/abilities/impact.ts` | `boonPower`; `abilityHit` × it (Task 2); `knobHitOpts` carries `stackTime` (Task 4) |
| `packages/engine/src/arpg/basic.ts` | a blow's `unit` × `boonPower` (Task 2); no basic mana under Blood Price (Task 7). Two lines; not in the overview's table, claimed here |
| `packages/engine/src/arpg/abilities/resolve.ts` | `stepBonus(bal, index, extra = 0)` (Task 2): the one line the overview gives B2 |
| `packages/engine/src/arpg/abilities/forms.ts` | `executeForm`'s `stepBonus` call (Task 2); its `buff` closure takes seconds and lengthens them (Task 8). Not in the overview's table, claimed here |
| `packages/engine/src/arpg/combat.ts` | `HitOpts.stackTime`, `applyStacks`/`addStatus` (Task 4); `boonFoeMult` in `hitMonster` (Task 3); Last Stand in `hurtHero` (Task 9); `dropLoot`'s `gear`, Obsidian's `until` (Task 10) |
| `packages/engine/src/arpg/abilities/defend.ts` | `guardLand` keeps a floor-long barrier (Task 10) |
| `packages/engine/src/arpg/dodge.ts` | `dodgeMax`, `dodgeRecharge`, `perfectWindow`; `tryDodge`, `dodgeTick`, `perfectOrigin`, `refundDodgeCharge` (Task 5); `tryDodge` opens Free Cast's window (Task 6) |
| `packages/engine/src/arpg/abilities/cast.ts` | `stepBonus` calls (Task 2); `canAfford`, `pay`, `fire`, the wind-up's `free` (Tasks 6, 7); `lifeCost` (Task 7) |
| `packages/engine/src/types/arpg.ts` | `HeroEntity.freeCastUntil?`, `windup.free?` (Task 6); `lastStandUsed?`, `lastStandUntil?` (Task 9) |
| `packages/engine/tests/delve-boons-combat.test.ts` (new) | one `describe` a site, each field on and off |

`defend.ts` changes only for Guard's floor-barrier rule (Task 10); the Defensive's duration is set in `forms.ts`'s `buff` (see "Where the spec left room"). Not touched: `world.ts`, `step.ts`, `interact.ts` (B3's), the client, `src/index.ts` (see Needs routed).

## Needs routed

For the integrator, applied at merge:

1. **`world.ts` (B3's), `createHeroEntity`:** the hero starts with its full dodge charges, boons included. A writes `boon: buffSum(diveBuffs),` inline in the returned object. Hoist it: after `const diveBuffs = [...(opts.diveBuffs ?? [])];` add `const boon = buffSum(diveBuffs);`; in the object replace `boon: buffSum(diveBuffs),` with `boon,` and `dodgeCharges: registry.getDelveBalance().dodge.charges,` with `dodgeCharges: dodgeMax(registry.getDelveBalance(), boon),` (the function has no `bal` local); add `import { dodgeMax } from './dodge.js';` (safe: `dodge.ts` imports only types, `geometry`, `grid`, `targeting` and `action`, which `world.ts` already reaches). Without it Third Wind's extra charge arrives only after the first dodge, and No Retreat's hero keeps 2 charges until it dodges once.
2. **`src/index.ts` (A's):** export `dodgeMax` and `dodgeRecharge` from `./arpg/dodge.js`, and `lifeCost` from `./arpg/abilities/cast.js`.
3. **`useArenaCore.ts` (C2's), the HUD snapshot:** `dodgeMax: dodgeMax(bal, h.boon),` (was `dodgeBal.charges`) and `dodgeRefill`'s divisor `dodgeRecharge(bal, h.boon)` (was `dodgeBal.recharge`). Slot affordability already goes through `canAfford`, so Blood Price and Free Cast read right on the HUD as they are.
4. **`types/arpg.ts`:** B2 adds four optional fields, so A's and B3's edits there merge beside them: on `HeroEntity`, after `dodgeRechargeAt`, `freeCastUntil?`, `lastStandUsed?`, `lastStandUntil?`; in `HeroEntity.windup`, after `chargePaid`, `free?`.
5. **`basic.ts`, `forms.ts`:** B2 edits the lines named in Files; A's `echo` flag edit in `landBlow` is elsewhere in the function.
6. **B3 (`barrierOnFloor`):** a floor-long barrier is `HeroEntity.barrier` with `until: Infinity`; Task 10 keeps it so under Obsidian and Guard. The `gear` field is handled here (Task 10), not in B3's `DropContext`.
7. **D (docs):** CLAUDE.md's Delve section gains the handlers' names (`boonPower`, `boonFoeMult`, `dodgeMax`, `dodgeRecharge`, `lifeCost`, the wind-up's `free`, Last Stand's fields).

## Where the spec left room

1. **`stepBonus` is a function, not a field.** There is no `ResolvedChain.stepBonus`: the step bonus is `stepBonus(bal, index)` in `resolve.ts`. It gains `extra = 0`, added to `delve.chains.stepBonus` (power and size). The sim's three calls pass `h.boon.stepBonus` (`executeForm`, the recoil and the step-in in `cast.ts`); `moveNumbers` and Power keep two arguments, since no boon reaches the Anvil.
2. **`byKind`** reads a move's own kind (a hold move is `hold` at every stage) and a blow's kind as it plays (`landBlow`'s `kind`). **`firstMove`** is an ability chain's first move (`ab.index === 0`, so a one-move chain always gets it); the basic chain's first blow doesn't (one line in `landBlow` if wanted: `blow === w.blows[0]`). Both go in `abilityHit` and a blow's `unit`, so every hit of the move or blow, its shots, zones, shards and echo included, carries them.
3. **`lowLife` and `nearFoes`** apply in `hitMonster`, the one per-foe site (Strike arcs and beams hit there directly, not through `impact`), to the hero's own hits only (`basic`, `skill`), never a DoT, a reaction, thorns or a hazard. "Awake" is `aggro`; the radius is measured from the hero's centre to the foe's.
4. **The perfect window** is `perfectWindow × (1 + Σ)`, capped at the i-frames (past them a hit lands, so it can't also be perfect); `perfectAlways` makes the window the whole i-frames.
5. **Free Cast** waives the mana (or, under Blood Price, the life), never the charge or the cooldown. Its window opens at a dodge and closes at the next payment (a press, or a hold's release); a dodge that cancels the free cast's wind-up opens it again. Its damage rides the move's `power` for that cast (its shots, zones and echo carry it), passed from `pay` to the landing through the wind-up's `free`.
6. **Blood Price** pays `lifeCost(h, ab.cost)` at the same moment mana would go. A charge move's cost is 0, so it costs no life; a cast chain's cost is its mana part. Its `pay` event reports 0 mana. Drain still adds mana (which buys nothing under it).
7. **`defendDuration`** lengthens the Defensive's effect where it is set, `forms.ts`'s `buff` (Ward, Armor, Surge, and Blink's trail), not `defend.ts` (which only reads `defend.until`). The Ward's shield is unchanged.
8. **Last Stand:** the hit that crosses under `below` lands in full; the cut applies to the hits after it, before the shields (armour, then the cut, then the barrier and the Ward). "Once a floor" is the hero entity: a new floor builds a new hero. No event (the HUD can add one later).
9. **`stackTime`** reaches every hit through `knobHitOpts` (abilities, blows, shots). A spread, `applyStatus` and the riposte's stagger carry none.
10. **Accepted edges:** `boonFoeMult` applies to every `basic`/`skill`-source hit, a blow's zone ticks included. Free Cast's bonus rides the cast move only; a Defensive's later hits (the Ward's burst, Armor's riposte) read `defendingAbility`, the chain's own move, and don't carry it. A's "refresh `h.boon` wherever a buff is added" isn't B2's concern: B2 adds no buff.
11. **Drain under Blood Price:** `manaOnHit` gives no mana either, gated with the basics' (Task 7).
12. **Tests** live in one new file, `delve-boons-combat.test.ts`, a `describe` a site, rather than spread over the sites' files: B3 and A edit several of those, and one file keeps the merges clean.

## Conventions

- One commit a task, staged by path, ending with the trailer `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Never push or merge.
- Keep each file's line endings (the Edit tool does); new files are LF. Format only the new test file (`npx prettier --write --end-of-line auto`); the code below is written at the repo's style (`printWidth` 100).
- "Replace … with …" is one Edit; within a file apply edits top to bottom.
- Every task runs: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot)` and the fingerprint check.

---

## Chunk 1: Stats and the damage path

### Task 1: `applyBuffs`: max life, tempo, lifesteal, Blood Price's regen

**Files:**
- Create: `packages/engine/tests/delve-boons-combat.test.ts`
- Modify: `packages/engine/src/delve/hero-stats.ts`

- [ ] **Step 1: The failing tests.** Create `packages/engine/tests/delve-boons-combat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyBuffs, computeHeroStats } from '../src/delve/hero-stats.js';
import { buffSum } from '../src/delve/boons.js';
import { makeCtx } from '../src/arpg/combat.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { BoonEffect, Buff } from '../src/types/boon.js';
import { gear, registry } from './fixtures/arena.js';

// The boons spec §2: each combat field at its one site. Without the boon, nothing moves.

const STATS = computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry);
const buff = (effect: BoonEffect): Buff => ({ boon: 'test', tier: 1, effect });

/** The hero wears these boons: its `boon` view only (its stats stay as built). */
function wear(w: ArpgWorld, ...effects: BoonEffect[]): ArpgWorld {
  w.hero.boon = buffSum(effects.map(buff));
  return w;
}
const ctxOf = (w: ArpgWorld) => makeCtx(registry, w, []);

/** The first hit's amount from `source` in `events` (NaN: none). */
function firstHit(events: ArpgEvent[], source: 'basic' | 'skill'): number {
  const e = events.find((x) => x.kind === 'hit' && x.source === source);
  return e?.kind === 'hit' ? e.amount : NaN;
}

describe('applyBuffs (hero-stats.ts)', () => {
  it('maxLife multiplies max life per entry, the product floored at 0.3', () => {
    const s = applyBuffs(STATS, [buff({ maxLife: -0.2 }), buff({ maxLife: 0.5 })]);
    expect(s.maxHp).toBeCloseTo(STATS.maxHp * 0.8 * 1.5, 9);
    const floor = applyBuffs(STATS, [buff({ maxLife: -0.5 }), buff({ maxLife: -0.5 })]);
    expect(floor.maxHp).toBeCloseTo(STATS.maxHp * 0.3, 9);
  });

  it('tempo multiplies the tempo by (1 − x) per entry, the product floored at 0.5', () => {
    const s = applyBuffs(STATS, [buff({ tempo: 0.1 }), buff({ tempo: 0.2 })]);
    expect(s.tempo).toBeCloseTo(STATS.tempo * 0.9 * 0.8, 12);
    const floor = applyBuffs(STATS, [buff({ tempo: 0.4 }), buff({ tempo: 0.4 })]);
    expect(floor.tempo).toBeCloseTo(STATS.tempo * 0.5, 12);
  });

  it('lifesteal adds', () => {
    const s = applyBuffs(STATS, [buff({ lifesteal: 0.015 }), buff({ lifesteal: 0.025 })]);
    expect(s.lifesteal).toBeCloseTo(STATS.lifesteal + 0.04, 12);
  });

  it('Blood Price stops mana regen; a boon without these fields leaves them be', () => {
    const blood = applyBuffs(STATS, [buff({ manaRegen: 0.5 }), buff({ bloodPrice: 0.5 })]);
    expect(blood.manaRegenMult).toBe(0);
    const plain = applyBuffs(STATS, [buff({ damage: 0.2 })]);
    expect([plain.maxHp, plain.tempo, plain.lifesteal, plain.manaRegenMult]).toEqual([
      STATS.maxHp,
      STATS.tempo,
      STATS.lifesteal,
      STATS.manaRegenMult,
    ]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx vitest run tests/delve-boons-combat.test.ts --reporter=dot)
```

  Expected: **4 failed** (max life, tempo and lifesteal unchanged; `manaRegenMult` 1.5 × the base).

- [ ] **Step 3: Implement.** In `packages/engine/src/delve/hero-stats.ts`, replace:

```ts
/**
 * `stats` under blessings (see the floor maps spec): each multiplies damage
 * and mana regen and adds life regen (Find and potions act on the world, not
 * here). No blessings: `stats` itself.
 */
export function applyBuffs(stats: HeroStats, buffs: readonly Buff[]): HeroStats {
  if (buffs.length === 0) return stats;
  let { damageMult, manaRegenMult } = stats;
  let lifeRegen = stats.lifeRegen ?? 0;
  for (const { effect } of buffs) {
    damageMult *= 1 + (effect.damage ?? 0);
    manaRegenMult *= 1 + (effect.manaRegen ?? 0);
    lifeRegen += effect.lifeRegen ?? 0;
  }
  return { ...stats, damageMult, manaRegenMult, lifeRegen };
}
```

with:

```ts
/**
 * `stats` under boons and blessings (the boons spec §2), one pass a list (the
 * dive's, then the floor's): damage, mana regen, max life (its product floored
 * at 0.3) and tempo (× (1 − x), its product floored at 0.5) multiply per entry;
 * life regen and lifesteal add; Blood Price stops mana regen. Everything else a
 * boon does acts in the sim, not here. No entries: `stats` itself.
 */
export function applyBuffs(stats: HeroStats, buffs: readonly Buff[]): HeroStats {
  if (buffs.length === 0) return stats;
  let { damageMult, manaRegenMult, lifesteal } = stats;
  let lifeRegen = stats.lifeRegen ?? 0;
  let life = 1;
  let tempo = 1;
  for (const { effect } of buffs) {
    damageMult *= 1 + (effect.damage ?? 0);
    manaRegenMult *= effect.bloodPrice ? 0 : 1 + (effect.manaRegen ?? 0);
    lifeRegen += effect.lifeRegen ?? 0;
    lifesteal += effect.lifesteal ?? 0;
    life *= 1 + (effect.maxLife ?? 0);
    tempo *= 1 - (effect.tempo ?? 0);
  }
  return {
    ...stats,
    damageMult,
    manaRegenMult,
    lifeRegen,
    lifesteal,
    maxHp: stats.maxHp * Math.max(0.3, life),
    tempo: stats.tempo * Math.max(0.5, tempo),
  };
}
```

  (With no such field `life` and `tempo` stay exactly 1, so `maxHp` and `tempo` are bit-identical.)

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-combat.test.ts tests/delve-maps-buffs.test.ts tests/delve-maps-flow.test.ts --reporter=dot)
```

  Expected: no type errors; all pass. Then the fingerprint check: identical.

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-boons-combat.test.ts)
git add packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-boons-combat.test.ts
git commit -m "feat(engine): boons' max life, tempo, lifesteal and Blood Price regen in applyBuffs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: `byKind`, `firstMove`, `stepBonus`

**Files:**
- Modify: `packages/engine/src/arpg/abilities/impact.ts`, `packages/engine/src/arpg/basic.ts`, `packages/engine/src/arpg/abilities/resolve.ts`, `packages/engine/src/arpg/abilities/forms.ts`, `packages/engine/src/arpg/abilities/cast.ts`, `packages/engine/tests/delve-boons-combat.test.ts`

- [ ] **Step 1: The failing tests.** In the test file, add to the imports:

```ts
import { abilityHit } from '../src/arpg/abilities/impact.js';
import { stepBonus } from '../src/arpg/abilities/resolve.js';
import { arena, bal, dummy, firstBlow, moveOf, press, run } from './fixtures/arena.js';
```

  (merge the last line into the existing `./fixtures/arena.js` import). Append:

```ts
const BOLT = { kind: 'medium', form: 'bolt', elements: ['fire'] } as const;

/** No crits, so twin worlds roll alike whatever their timing. */
function noCrit(w: ArpgWorld): ArpgWorld {
  w.hero.stats = { ...w.hero.stats, critChance: 0 };
  return w;
}

describe('the damage path: kind, first move, step bonus (impact.ts, resolve.ts)', () => {
  it("byKind and firstMove scale an ability's hit by its kind and its chain step", () => {
    const w = arena([], {
      noBasic: true,
      primary: { moves: [BOLT, { ...BOLT, kind: 'heavy' }] },
    });
    const ctx = ctxOf(w);
    const [first, second] = [moveOf(w, 0, 0), moveOf(w, 0, 1)];
    const before = [abilityHit(ctx, first), abilityHit(ctx, second)];
    wear(w, { byKind: { heavy: 0.3 } }, { firstMove: 0.25 });
    expect(abilityHit(ctx, first)).toBeCloseTo(before[0] * 1.25, 9);
    expect(abilityHit(ctx, second)).toBeCloseTo(before[1] * 1.3, 9);
  });

  it('byKind scales a basic blow by the kind it plays as', () => {
    const blow = (boon: boolean) => {
      const w = noCrit(arena([dummy(13, 34.5)]));
      if (boon) wear(w, { byKind: { light: 0.5, medium: 0.5, heavy: 0.5, hold: 0.5 } });
      return firstHit(firstBlow(w), 'basic');
    };
    expect(blow(true)).toBeCloseTo(blow(false) * 1.5, 6);
  });

  it('stepBonus adds to the chain step bonus, its power and its size', () => {
    const s = bal.chains.stepBonus;
    expect(stepBonus(bal, 0, 0.05)).toEqual(stepBonus(bal, 0));
    expect(stepBonus(bal, 2, 0.05).power).toBeCloseTo(1 + (s + 0.05) * 2, 12);
    expect(stepBonus(bal, 2, 0.05).size).toBeCloseTo(1 + s + 0.05, 12);
  });

  it("a chain's second move lands with the boon's step bonus", () => {
    const second = (boon: boolean) => {
      const w = noCrit(arena([dummy(13, 30)], { noBasic: true, primary: { moves: [BOLT, BOLT] } }));
      if (boon) wear(w, { stepBonus: 0.1 });
      // The last move landed now: the next press casts the second.
      w.hero.comboStep[0] = 0;
      w.hero.comboAt[0] = w.t;
      return firstHit([...press(w, 0), ...run(w, 1)], 'skill');
    };
    const s = bal.chains.stepBonus;
    expect(second(true)).toBeCloseTo((second(false) * (1 + s + 0.1)) / (1 + s), 6);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `(cd packages/engine && npx vitest run tests/delve-boons-combat.test.ts --reporter=dot)`. Expected: **4 failed** (the hits and `stepBonus` ignore the boons).

- [ ] **Step 3: Implement.**

  In `packages/engine/src/arpg/abilities/impact.ts`, replace:

```ts
import {
  ABILITY_SLOTS,
  type Knobs,
  type ResolvedAbility,
  type SplitKnob,
  type ZoneKnob,
} from '../../types/ability.js';
import type { MonsterEntity, StatusId, Vec } from '../../types/arpg.js';
```

  with:

```ts
import {
  ABILITY_SLOTS,
  type Knobs,
  type MoveKind,
  type ResolvedAbility,
  type SplitKnob,
  type ZoneKnob,
} from '../../types/ability.js';
import type { MonsterEntity, StatusId, Vec } from '../../types/arpg.js';
import type { BoonSum } from '../../types/boon.js';
```

  Replace:

```ts
/** One hit of an ability before per-foe modifiers: weapon damage × the ability's power. */
export function abilityHit(ctx: SimCtx, ab: ResolvedAbility): number {
  const s = ctx.world.hero.stats;
  return s.weaponDamage * s.damageMult * ab.power;
}
```

  with:

```ts
/**
 * The boons' damage on a move or a blow (the boons spec §2): `byKind` by its
 * kind, and `firstMove` on a chain's first move. 1 with no boon.
 */
export function boonPower(boon: BoonSum, kind: MoveKind, first: boolean): number {
  return (1 + (boon.byKind?.[kind] ?? 0)) * (first ? 1 + (boon.firstMove ?? 0) : 1);
}

/**
 * One hit of an ability before per-foe modifiers: weapon damage × the
 * ability's power × the boons' (`boonPower`).
 */
export function abilityHit(ctx: SimCtx, ab: ResolvedAbility): number {
  const h = ctx.world.hero;
  const s = h.stats;
  return s.weaponDamage * s.damageMult * ab.power * boonPower(h.boon, ab.kind, ab.index === 0);
}
```

  In `packages/engine/src/arpg/basic.ts`, replace:

```ts
import { chainJumps, knobHitOpts, shedShards, spendZone } from './abilities/impact.js';
```

  with:

```ts
import { boonPower, chainJumps, knobHitOpts, shedShards, spendZone } from './abilities/impact.js';
```

  and replace:

```ts
  const unit = h.stats.weaponDamage * h.stats.damageMult * blow.attunePower;
```

  with:

```ts
  const unit =
    h.stats.weaponDamage * h.stats.damageMult * blow.attunePower * boonPower(h.boon, kind, false);
```

  In `packages/engine/src/arpg/abilities/resolve.ts`, replace:

```ts
/** The step bonus of the move at `index`: its power and size factors. */
export function stepBonus(bal: DelveBalance, index: number): { power: number; size: number } {
  const b = bal.chains.stepBonus * index;
```

  with:

```ts
/**
 * The step bonus of the move at `index`: its power and size factors. `extra`
 * adds to `chains.stepBonus` (a boon's, Closer: the boons spec §2).
 */
export function stepBonus(
  bal: DelveBalance,
  index: number,
  extra = 0,
): { power: number; size: number } {
  const b = (bal.chains.stepBonus + extra) * index;
```

  In `packages/engine/src/arpg/abilities/forms.ts`, replace:

```ts
  const { power, size } = stepBonus(ctx.bal, ab.index);
```

  with:

```ts
  const { power, size } = stepBonus(ctx.bal, ab.index, h.boon.stepBonus);
```

  In `packages/engine/src/arpg/abilities/cast.ts`, replace:

```ts
    const size = stepBonus(bal, ab.index).size;
```

  with:

```ts
    const size = stepBonus(bal, ab.index, h.boon.stepBonus).size;
```

  and replace:

```ts
    const reach = Math.min(ab.motion * stepBonus(bal, ab.index).size, dist(h.x, h.y, at.x, at.y));
```

  with:

```ts
    const reach = Math.min(
      ab.motion * stepBonus(bal, ab.index, h.boon.stepBonus).size,
      dist(h.x, h.y, at.x, at.y),
    );
```

  (With no boon `boonPower` is exactly 1 and `extra` is 0, so every product is bit-identical.)

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-combat.test.ts tests/ability-cast.test.ts tests/delve-chains.test.ts tests/delve-combat-weight.test.ts --reporter=dot)
```

  Expected: no type errors; all pass. Fingerprint check: identical.

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-boons-combat.test.ts)
git add packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/tests/delve-boons-combat.test.ts
git commit -m "feat(engine): boons by kind, on a chain's first move, and on the step bonus" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `lowLife`, `nearFoes`

**Files:**
- Modify: `packages/engine/src/arpg/combat.ts`, `packages/engine/tests/delve-boons-combat.test.ts`

- [ ] **Step 1: The failing tests.** Add `hitMonster` to the `../src/arpg/combat.js` import. Append:

```ts
describe('the damage path: per foe (combat.ts)', () => {
  it("lowLife: more on a foe under its threshold, from the hero's hits only", () => {
    const w = wear(arena([dummy(13, 30)], { noBasic: true }), {
      lowLife: { below: 0.25, mult: 0.4 },
    });
    const ctx = ctxOf(w);
    const [m] = w.monsters;
    m.hp = m.maxHp * 0.5;
    expect(hitMonster(ctx, m, 100, null, { source: 'skill' })).toBeCloseTo(100, 9);
    m.hp = m.maxHp * 0.2;
    expect(hitMonster(ctx, m, 100, null, { source: 'skill' })).toBeCloseTo(140, 9);
    expect(hitMonster(ctx, m, 100, null, { source: 'dot' })).toBeCloseTo(100, 9);
  });

  it('nearFoes: more per awake foe within its radius of the hero, to its cap', () => {
    const near = (aggro: boolean) => [
      dummy(13, 34, { aggro }),
      dummy(14, 35, { aggro }),
      dummy(12, 35, { aggro }),
    ];
    const boon = { nearFoes: { per: 0.05, cap: 2, radius: 4 } };
    const awake = wear(arena([...near(true), dummy(13, 20, { aggro: true })], { noBasic: true }), boon);
    expect(hitMonster(ctxOf(awake), awake.monsters[3], 100, null, { source: 'skill' })).toBeCloseTo(110, 9);
    const asleep = wear(arena(near(false), { noBasic: true }), boon);
    expect(hitMonster(ctxOf(asleep), asleep.monsters[0], 100, null, { source: 'skill' })).toBeCloseTo(100, 9);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **2 failed** (140 and 110 read 100).

- [ ] **Step 3: Implement.** In `packages/engine/src/arpg/combat.ts`, replace:

```ts
  if (crit) amount *= stats.critMultiplier;
```

  with:

```ts
  if (crit) amount *= stats.critMultiplier;
  if (opts.source === 'basic' || opts.source === 'skill') amount *= boonFoeMult(ctx, m);
```

  and insert, directly above `export function hitMonster(`:

```ts
/**
 * The boons' per-foe damage on the hero's own hits (the boons spec §2):
 * `lowLife` on a foe under its threshold, `nearFoes` per awake foe within its
 * radius of the hero, to its cap. 1 with neither.
 */
function boonFoeMult(ctx: SimCtx, m: MonsterEntity): number {
  const h = ctx.world.hero;
  const { lowLife, nearFoes } = h.boon;
  let mult = 1;
  if (lowLife && m.hp < lowLife.below * m.maxHp) mult *= 1 + lowLife.mult;
  if (nearFoes) {
    const n = ctx.world.monsters.filter(
      (f) => !f.dead && f.aggro && dist(h.x, h.y, f.x, f.y) <= nearFoes.radius,
    ).length;
    mult *= 1 + nearFoes.per * Math.min(n, nearFoes.cap);
  }
  return mult;
}

```

  (`hitMonster` has no doc comment: insert the block directly above `export function hitMonster(`.)

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-combat.test.ts tests/delve-stacks.test.ts tests/delve-reactions.test.ts --reporter=dot)
```

  Fingerprint check: identical.

- [ ] **Step 5: Commit** (`combat.ts` and the test file): `feat(engine): boons on low-life foes and per foe near the hero`.

### Task 4: `stackTime`

**Files:**
- Modify: `packages/engine/src/arpg/combat.ts`, `packages/engine/src/arpg/abilities/impact.ts`, `packages/engine/tests/delve-boons-combat.test.ts`

- [ ] **Step 1: The failing test.** Add `knobHitOpts` to the `impact.js` import and `NEUTRAL` to the `resolve.js` import. Append:

```ts
describe('stackTime (combat.ts applyStacks)', () => {
  it('lengthens the stacks a hit applies; a hit carries the knob through knobHitOpts', () => {
    expect(knobHitOpts({ ...NEUTRAL, stackTime: 0.3 }).stackTime).toBe(0.3);
    const w = arena([dummy(13, 30)], { noBasic: true });
    const ctx = ctxOf(w);
    const [m] = w.monsters;
    const fire = { source: 'skill', applies: ['burn'], stacks: 1 } as const;
    hitMonster(ctx, m, 10, 'fire', { ...fire, applies: [...fire.applies] });
    expect(m.status.stackUntil.fire).toBeCloseTo(w.t + bal.stacks.duration.fire, 9);
    hitMonster(ctx, m, 10, 'fire', { ...fire, applies: [...fire.applies], stackTime: 0.5 });
    expect(m.status.stackUntil.fire).toBeCloseTo(w.t + bal.stacks.duration.fire * 1.5, 9);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **1 failed** (`knobHitOpts` gives no `stackTime`).

- [ ] **Step 3: Implement.** In `packages/engine/src/arpg/combat.ts`, in `HitOpts`, replace:

```ts
  stacks?: number;
}
```

  (the last field of `HitOpts`, before `BASIC_STATUS`) with:

```ts
  stacks?: number;
  /** The stacks it applies last × (1 + this) (the `stackTime` knob; see the boons spec §3). */
  stackTime?: number;
}
```

  Replace:

```ts
  ref: number,
  slot: number | undefined,
): void {
  const s = m.status;
  const t = ctx.world.t;
  const active = s.stacks[element] > 0;
  if (!active && n <= 0) return;
  s.stacks[element] = Math.min(stackCap(ctx, element), s.stacks[element] + Math.max(0, n));
  s.stackUntil[element] = t + ctx.bal.stacks.duration[element];
```

  with:

```ts
  ref: number,
  slot: number | undefined,
  time = 0,
): void {
  const s = m.status;
  const t = ctx.world.t;
  const active = s.stacks[element] > 0;
  if (!active && n <= 0) return;
  s.stacks[element] = Math.min(stackCap(ctx, element), s.stacks[element] + Math.max(0, n));
  s.stackUntil[element] = t + ctx.bal.stacks.duration[element] * (1 + time);
```

  In `addStatus`, replace:

```ts
  slot: number | undefined,
  n: number,
): void {
  const st = ctx.bal.status;
```

  with:

```ts
  slot: number | undefined,
  n: number,
  time = 0,
): void {
  const st = ctx.bal.status;
```

  then:

```ts
    applyStacks(ctx, m, element, n, hitAmount * perStack, slot);
```

  with:

```ts
    applyStacks(ctx, m, element, n, hitAmount * perStack, slot, time);
```

  and:

```ts
      applyStacks(ctx, m, 'frost', ctx.bal.stacks.freezeAt - s.stacks.frost, 0, slot);
```

  with:

```ts
      applyStacks(ctx, m, 'frost', ctx.bal.stacks.freezeAt - s.stacks.frost, 0, slot, time);
```

  In `hitMonster`, replace:

```ts
  const add = (s: StatusId) => addStatus(ctx, m, s, amount, opts.rattles, opts.slot, k);
```

  with:

```ts
  const add = (s: StatusId) =>
    addStatus(ctx, m, s, amount, opts.rattles, opts.slot, k, opts.stackTime);
```

  In `packages/engine/src/arpg/abilities/impact.ts`, replace:

```ts
/** The hit-time knobs a hit carries: lifesteal, Volatile and Drain (see the runes spec). */
export function knobHitOpts(k: Knobs): Pick<HitOpts, 'leech' | 'catalyst' | 'manaOnHit'> {
  return { leech: k.lifesteal, catalyst: k.catalyst, manaOnHit: k.manaOnHit };
}
```

  with:

```ts
/**
 * The hit-time knobs a hit carries: lifesteal, Volatile and Drain (see the runes
 * spec), and the boons' stack time.
 */
export function knobHitOpts(
  k: Knobs,
): Pick<HitOpts, 'leech' | 'catalyst' | 'manaOnHit' | 'stackTime'> {
  return { leech: k.lifesteal, catalyst: k.catalyst, manaOnHit: k.manaOnHit, stackTime: k.stackTime };
}
```

  (`duration × (1 + 0)` is the duration exactly.)

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-combat.test.ts tests/delve-stacks.test.ts tests/delve-reactions.test.ts tests/delve-runes-contract.test.ts --reporter=dot)
```

  Fingerprint check: identical.

- [ ] **Step 5: Commit** (`combat.ts`, `impact.ts`, the test file): `feat(engine): the stackTime knob lengthens a hit's stacks`.

## Chunk 2: The dodge, the payment, the Defensive, Last Stand

### Task 5: `dodgeCharges`, `dodgeRecharge`, `dodgeWindow`, `perfectAlways`

**Files:**
- Modify: `packages/engine/src/arpg/dodge.ts`, `packages/engine/tests/delve-boons-combat.test.ts`

- [ ] **Step 1: The failing tests.** Add `hurtHero` to the `combat.js` import, `dodge` to the fixtures import, and:

```ts
import { dodgeMax, dodgeRecharge, perfectOrigin, refundDodgeCharge } from '../src/arpg/dodge.js';
```

  Append:

```ts
describe('the dodge (dodge.ts)', () => {
  it('dodgeCharges: more charges (at least 1), refunded and refilled to the new max', () => {
    const w = wear(arena([], { noBasic: true }), { dodgeCharges: 1 });
    const max = bal.dodge.charges + 1;
    expect(dodgeMax(bal, w.hero.boon)).toBe(max);
    expect(dodgeMax(bal, buffSum([buff({ dodgeCharges: -5 })]))).toBe(1);
    w.hero.dodgeCharges = max - 1;
    refundDodgeCharge(ctxOf(w));
    expect(w.hero.dodgeCharges).toBe(max);
    w.hero.dodgeCharges = 0;
    w.hero.dodgeRechargeAt = w.t + bal.dodge.recharge;
    run(w, bal.dodge.recharge * max + 0.1);
    expect([w.hero.dodgeCharges, w.hero.dodgeRechargeAt]).toEqual([max, 0]);
  });

  it('dodgeRecharge: a charge comes back sooner, at most twice as fast', () => {
    const fast = dodgeRecharge(bal, buffSum([buff({ dodgeRecharge: 0.9 })]));
    expect(fast).toBeCloseTo(bal.dodge.recharge * 0.5, 12);
    const w = wear(arena([], { noBasic: true }), { dodgeRecharge: 0.2 });
    dodge(w);
    expect(w.hero.dodgeRechargeAt - w.hero.dodge!.start).toBeCloseTo(bal.dodge.recharge * 0.8, 9);
  });

  it('dodgeWindow lengthens the perfect window, never past the i-frames', () => {
    const { perfectWindow: pw, iframes } = bal.dodge;
    const late = (pw + iframes) / 2;
    const perfectAt = (seconds: number, ...effects: BoonEffect[]) => {
      const w = wear(arena([], { noBasic: true }), ...effects);
      dodge(w);
      w.t = w.hero.dodge!.start + seconds;
      return perfectOrigin(ctxOf(w)) !== null;
    };
    expect(perfectAt(late)).toBe(false);
    expect(perfectAt(late, { dodgeWindow: late / pw - 1 + 0.01 })).toBe(true);
    expect(perfectAt(iframes + 0.01, { dodgeWindow: 5 })).toBe(false);
  });

  it('perfectAlways: a hit anywhere in the i-frames makes a perfect dodge', () => {
    const perfect = (always: boolean) => {
      const w = arena([], { noBasic: true });
      if (always) wear(w, { perfectAlways: true });
      dodge(w);
      w.t = w.hero.dodge!.start + bal.dodge.iframes - 0.01;
      const events: ArpgEvent[] = [];
      hurtHero(makeCtx(registry, w, events), 50, null, null);
      return events.some((e) => e.kind === 'perfectDodge');
    };
    expect([perfect(false), perfect(true)]).toEqual([false, true]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **4 failed** (`dodgeMax` and `dodgeRecharge` are not exported yet; the window is 0.15 s whatever the boon).

- [ ] **Step 3: Implement.** In `packages/engine/src/arpg/dodge.ts`, replace:

```ts
import type { Vec } from '../types/arpg.js';
import type { SimCtx } from './combat.js';
```

  with:

```ts
import type { Vec } from '../types/arpg.js';
import type { BoonSum } from '../types/boon.js';
import type { DelveBalance } from '../types/delve.js';
import type { SimCtx } from './combat.js';
```

  Insert after the module's doc comment (above `export function isDashing`):

```ts
/** The hero's dodge charges: `dodge.charges` plus the boons' (the boons spec §2), at least 1. */
export function dodgeMax(bal: DelveBalance, boon: BoonSum): number {
  return Math.max(1, bal.dodge.charges + (boon.dodgeCharges ?? 0));
}

/** Seconds a dodge charge takes to come back: `dodge.recharge` × (1 − the boons'), at least half. */
export function dodgeRecharge(bal: DelveBalance, boon: BoonSum): number {
  return bal.dodge.recharge * Math.max(0.5, 1 - (boon.dodgeRecharge ?? 0));
}

/**
 * How far into a dodge an attack still makes it perfect: `perfectWindow` × (1 +
 * the boons'), never past the i-frames; with `perfectAlways`, the whole i-frames.
 */
function perfectWindow(bal: DelveBalance, boon: BoonSum): number {
  const { perfectWindow: w, iframes } = bal.dodge;
  return boon.perfectAlways ? iframes : Math.min(iframes, w * (1 + (boon.dodgeWindow ?? 0)));
}

```

  In `tryDodge`, replace:

```ts
  if (h.dodgeRechargeAt === 0) h.dodgeRechargeAt = t + bal.dodge.recharge;
```

  with:

```ts
  if (h.dodgeRechargeAt === 0) h.dodgeRechargeAt = t + dodgeRecharge(bal, h.boon);
```

  In `dodgeTick`, replace:

```ts
  if (h.dodgeRechargeAt > 0 && t >= h.dodgeRechargeAt) {
    h.dodgeCharges = Math.min(bal.dodge.charges, h.dodgeCharges + 1);
    h.dodgeRechargeAt =
      h.dodgeCharges < bal.dodge.charges ? h.dodgeRechargeAt + bal.dodge.recharge : 0;
  }
```

  with:

```ts
  if (h.dodgeRechargeAt > 0 && t >= h.dodgeRechargeAt) {
    const max = dodgeMax(bal, h.boon);
    h.dodgeCharges = Math.min(max, h.dodgeCharges + 1);
    h.dodgeRechargeAt = h.dodgeCharges < max ? h.dodgeRechargeAt + dodgeRecharge(bal, h.boon) : 0;
  }
```

  In `perfectOrigin`, replace:

```ts
  if (!d || d.perfect || ctx.world.t - d.start > ctx.bal.dodge.perfectWindow) return null;
```

  with:

```ts
  if (!d || d.perfect || ctx.world.t - d.start > perfectWindow(ctx.bal, ctx.world.hero.boon))
    return null;
```

  In `refundDodgeCharge`, replace:

```ts
  const max = ctx.bal.dodge.charges;
```

  with:

```ts
  const max = dodgeMax(ctx.bal, h.boon);
```

  (`h` is declared on the line above it.) With no boon: `max(1, 2 + 0)` is 2, `recharge × max(0.5, 1)` the recharge, and `min(iframes, perfectWindow × 1)` the window (the schema keeps it inside the i-frames): all exact.

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-combat.test.ts tests/delve-dodge.test.ts tests/delve-reactions.test.ts --reporter=dot)
```

  Fingerprint check: identical.

- [ ] **Step 5: Commit** (`dodge.ts`, the test file): `feat(engine): boons' dodge charges, recharge and perfect window`.

### Task 6: Free Cast

**Files:**
- Modify: `packages/engine/src/types/arpg.ts`, `packages/engine/src/arpg/dodge.ts`, `packages/engine/src/arpg/abilities/cast.ts`, `packages/engine/tests/delve-boons-combat.test.ts`

- [ ] **Step 1: The failing tests.** Add `STEP` to the fixtures import. Append:

```ts
describe('Free Cast (cast.ts)', () => {
  const caster = (damage: number) => {
    const w = noCrit(wear(arena([dummy(13, 30)], { noBasic: true }), { freeCast: { seconds: 1.5, damage } }));
    w.hero.manaRegen = 0;
    return w;
  };
  /** Mana a press spends after `wait` seconds (from a dodge, or not). */
  const spent = (dodged: boolean, wait: number) => {
    const w = caster(0);
    if (dodged) dodge(w, { x: 1, y: 0 });
    run(w, wait);
    const mana = w.hero.mana;
    press(w, 0);
    return mana - w.hero.mana;
  };

  it('the first ability within its seconds of a dodge is free; later, or without one, it pays', () => {
    const soon = bal.dodge.duration + STEP;
    expect(spent(true, soon)).toBe(0);
    expect(spent(false, soon)).toBeGreaterThan(0);
    expect(spent(true, 1.6)).toBeGreaterThan(0);
  });

  it("its hits carry the boon's damage", () => {
    const hit = (damage: number) => {
      const w = caster(damage);
      dodge(w, { x: 1, y: 0 });
      run(w, bal.dodge.duration + STEP);
      return firstHit([...press(w, 0), ...run(w, 1)], 'skill');
    };
    expect(hit(0.25)).toBeCloseTo(hit(0) * 1.25, 6);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **2 failed** (the press pays; the damage is the same).

- [ ] **Step 3: Implement.**

  In `packages/engine/src/types/arpg.ts`, in `HeroEntity.windup`, replace:

```ts
    /** Charge spent at the press (refunded if a dodge cancels). */
    chargePaid: number;
  } | null;
```

  with:

```ts
    /** Charge spent at the press (refunded if a dodge cancels). */
    chargePaid: number;
    /** A Free Cast's damage bonus, carried to the landing (0 or absent: none). */
    free?: number;
  } | null;
```

  and replace:

```ts
  /** When the next dodge charge arrives (0 = full). */
  dodgeRechargeAt: number;
```

  with:

```ts
  /** When the next dodge charge arrives (0 = full). */
  dodgeRechargeAt: number;
  /** Free Cast (a boon): an ability paid before this time is free (absent: none). */
  freeCastUntil?: number;
```

  In `packages/engine/src/arpg/dodge.ts`, `tryDodge`, replace:

```ts
  h.invulnUntil = Math.max(h.invulnUntil, t + bal.dodge.iframes);
```

  with:

```ts
  h.invulnUntil = Math.max(h.invulnUntil, t + bal.dodge.iframes);
  // Free Cast (a boon): the next ability paid within its seconds is free.
  if (h.boon.freeCast) h.freeCastUntil = t + h.boon.freeCast.seconds;
```

  In `packages/engine/src/arpg/abilities/cast.ts`, replace:

```ts
/** Can the hero pay for it? Infinite mana (Training Grounds) ignores cost, even one dearer than the whole pool. */
export function canAfford(world: ArpgWorld, ab: ResolvedAbility): boolean {
  return !!world.sandbox?.infiniteMana || world.hero.mana >= ab.cost;
}
```

  with:

```ts
/**
 * Can the hero pay for it? Infinite mana (Training Grounds) ignores cost, even
 * one dearer than the whole pool, as does a Free Cast's window after a dodge.
 */
export function canAfford(world: ArpgWorld, ab: ResolvedAbility): boolean {
  const h = world.hero;
  if (world.sandbox?.infiniteMana || world.t < (h.freeCastUntil ?? 0)) return true;
  return h.mana >= ab.cost;
}
```

  In `fire`, replace its signature's end and first lines:

```ts
  stage: number,
  aimed: boolean,
): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  // Only a slot with a chain winds up or holds.
  const ab = chainMove(h.chains[slot]!, step, stage);
```

  with:

```ts
  stage: number,
  aimed: boolean,
  bonus = 0,
): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  // Only a slot with a chain winds up or holds.
  const move = chainMove(h.chains[slot]!, step, stage);
  // A Free Cast's bonus rides the move's power, so every hit of this cast (its echo too) has it.
  const ab = bonus > 0 ? { ...move, power: move.power * (1 + bonus) } : move;
```

  Replace the whole of `pay` (its doc comment and body):

```ts
/**
 * Pay for move `step`: its mana, its own cooldown (from `from`), its charge from
 * the slot's meter. A `pay` event says what it really cost: infinite mana's
 * mana and no cooldowns' charge come straight back, so they're free.
 */
function pay(ctx: SimCtx, slot: number, step: number, ab: ResolvedAbility, from: number): void {
  const h = ctx.world.hero;
  const sandbox = ctx.world.sandbox;
  h.mana -= ab.cost;
  // No cooldowns (Training Grounds): no cooldown, and so no charge lockout.
  if (!sandbox?.noCooldowns) h.cooldowns[slot][step] = from + ab.cooldown;
  if (ab.payment === 'charge') h.charge[slot] = Math.max(0, h.charge[slot] - ab.chargeNeed);
  const mana = sandbox?.infiniteMana ? 0 : ab.cost;
  const charge = ab.payment === 'charge' && !sandbox?.noCooldowns ? ab.chargeNeed : 0;
  if (mana > 0 || charge > 0) ctx.events.push({ kind: 'pay', slot, mana, charge });
}
```

  with:

```ts
/**
 * Pay for move `step`: its mana, its own cooldown (from `from`), its charge from
 * the slot's meter. A Free Cast's window, while it runs, waives the mana and
 * closes. A `pay` event says what it really cost: infinite mana's mana and no
 * cooldowns' charge come straight back, so they're free. Returns a Free Cast's
 * damage bonus (0 for any other payment).
 */
function pay(ctx: SimCtx, slot: number, step: number, ab: ResolvedAbility, from: number): number {
  const h = ctx.world.hero;
  const sandbox = ctx.world.sandbox;
  const free = ctx.world.t < (h.freeCastUntil ?? 0);
  if (free) h.freeCastUntil = 0;
  else h.mana -= ab.cost;
  // No cooldowns (Training Grounds): no cooldown, and so no charge lockout.
  if (!sandbox?.noCooldowns) h.cooldowns[slot][step] = from + ab.cooldown;
  if (ab.payment === 'charge') h.charge[slot] = Math.max(0, h.charge[slot] - ab.chargeNeed);
  const mana = sandbox?.infiniteMana || free ? 0 : ab.cost;
  const charge = ab.payment === 'charge' && !sandbox?.noCooldowns ? ab.chargeNeed : 0;
  if (mana > 0 || charge > 0) ctx.events.push({ kind: 'pay', slot, mana, charge });
  return free ? (h.boon.freeCast?.damage ?? 0) : 0;
}
```

  In `castAbility`, replace:

```ts
  pay(ctx, slot, step, ab, t + ab.channel);
```

  with:

```ts
  const free = pay(ctx, slot, step, ab, t + ab.channel);
```

  and, in its `h.windup = { … }`, replace:

```ts
    conjureUntil: t + ab.conjure,
    chargePaid,
  };
```

  with:

```ts
    conjureUntil: t + ab.conjure,
    chargePaid,
    free,
  };
```

  In `releaseHold`, replace:

```ts
  pay(ctx, hold.slot, hold.step, ab, t + left);
  if (left < 1e-9) {
    const along = alongAim(h, { slot: hold.slot, step: hold.step, stage: s, from, at });
    if (!fire(ctx, hold.slot, aim && (along ?? aim), hold.step, s, aim !== null))
      fire(ctx, hold.slot, along ?? at, hold.step, s, aim !== null);
    return;
  }
```

  with:

```ts
  const free = pay(ctx, hold.slot, hold.step, ab, t + left);
  if (left < 1e-9) {
    const along = alongAim(h, { slot: hold.slot, step: hold.step, stage: s, from, at });
    if (!fire(ctx, hold.slot, aim && (along ?? aim), hold.step, s, aim !== null, free))
      fire(ctx, hold.slot, along ?? at, hold.step, s, aim !== null, free);
    return;
  }
```

  and, in its `h.windup = { … }`, replace:

```ts
    chargePaid: chain.payment === 'charge' ? ab.chargeNeed : 0,
  };
```

  with:

```ts
    chargePaid: chain.payment === 'charge' ? ab.chargeNeed : 0,
    free,
  };
```

  In `castTick`, replace:

```ts
  const { slot, aim, at, step, stage } = w;
```

  with:

```ts
  const { slot, aim, at, step, stage, free = 0 } = w;
```

  and:

```ts
  if (!fire(ctx, slot, aim && (along ?? aim), step, stage, aim !== null))
    fire(ctx, slot, along ?? at, step, stage, aim !== null);
}
```

  with:

```ts
  if (!fire(ctx, slot, aim && (along ?? aim), step, stage, aim !== null, free))
    fire(ctx, slot, along ?? at, step, stage, aim !== null, free);
}
```

  (Without the boon `freeCastUntil` is absent, `free` is 0 and `fire` uses the chain's own move object, so nothing changes; the wind-up gains a `free: 0` field no reader compares.)

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-combat.test.ts tests/ability-cast.test.ts tests/delve-chains.test.ts tests/delve-dodge.test.ts tests/delve-training.test.ts --reporter=dot)
```

  Fingerprint check: identical.

- [ ] **Step 5: Commit** (`types/arpg.ts`, `dodge.ts`, `cast.ts`, the test file): `feat(engine): Free Cast: the first ability after a dodge is free and hits harder`.

### Task 7: Blood Price

**Files:**
- Modify: `packages/engine/src/arpg/abilities/cast.ts`, `packages/engine/src/arpg/basic.ts`, `packages/engine/src/arpg/combat.ts`, `packages/engine/tests/delve-boons-combat.test.ts`

- [ ] **Step 1: The failing tests.** Add `pressOnly` to the fixtures import, and:

```ts
import { canAfford, lifeCost } from '../src/arpg/abilities/cast.js';
```

  Append:

```ts
describe('Blood Price (cast.ts, basic.ts)', () => {
  const bleeder = () => {
    const w = wear(arena([dummy(13, 30)], { noBasic: true }), { bloodPrice: 0.5 });
    w.hero.manaRegen = 0;
    w.hero.stats = { ...w.hero.stats, lifeRegen: 0 };
    return w;
  };

  it('an ability costs life, not mana: cost / manaMax × p × maxHp', () => {
    const w = bleeder();
    const h = w.hero;
    const cost = moveOf(w, 0).cost;
    const life = lifeCost(h, cost);
    expect(life).toBeCloseTo((cost / h.manaMax) * 0.5 * h.stats.maxHp, 9);
    const [hp, mana] = [h.hp, h.mana];
    pressOnly(w, 0);
    expect(h.mana).toBe(mana);
    expect(h.hp).toBeCloseTo(hp - life, 9);
  });

  it('refuses a cast that would leave under 1 life; a move costing no mana costs no life', () => {
    const w = bleeder();
    const ab = moveOf(w, 0);
    w.hero.hp = lifeCost(w.hero, ab.cost) + 0.5;
    const events = pressOnly(w, 0);
    expect(events.some((e) => e.kind === 'noMana')).toBe(true);
    expect(w.hero.windup).toBeNull();
    expect(canAfford(w, { ...ab, cost: 0 })).toBe(true);
  });

  it('Drain gives no mana under it', () => {
    const drained = (blood: boolean) => {
      const w = bleeder();
      if (!blood) wear(w);
      w.hero.mana = 0;
      w.hero.drainLeft[0] = 10;
      hitMonster(ctxOf(w), w.monsters[0], 10, null, { source: 'skill', slot: 0, manaOnHit: 2 });
      return w.hero.mana;
    };
    expect([drained(false), drained(true)]).toEqual([2, 0]);
  });

  it('basic hits give no mana under it', () => {
    const gain = (blood: boolean) => {
      const w = arena([dummy(13, 34.5)]);
      if (blood) wear(w, { bloodPrice: 0.5 });
      w.hero.manaRegen = 0;
      w.hero.mana = 0;
      firstBlow(w);
      return w.hero.mana;
    };
    expect(gain(false)).toBeGreaterThan(0);
    expect(gain(true)).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **4 failed** (`lifeCost` isn't exported; mana pays; Drain and the blow fill mana).

- [ ] **Step 3: Implement.** In `packages/engine/src/arpg/abilities/cast.ts`, replace `canAfford` (as Task 6 left it):

```ts
/**
 * Can the hero pay for it? Infinite mana (Training Grounds) ignores cost, even
 * one dearer than the whole pool, as does a Free Cast's window after a dodge.
 */
export function canAfford(world: ArpgWorld, ab: ResolvedAbility): boolean {
  const h = world.hero;
  if (world.sandbox?.infiniteMana || world.t < (h.freeCastUntil ?? 0)) return true;
  return h.mana >= ab.cost;
}
```

  with:

```ts
/**
 * Can the hero pay for it? Infinite mana (Training Grounds) ignores cost, even
 * one dearer than the whole pool, as does a Free Cast's window after a dodge.
 * Under Blood Price the cost is life, refused when it would leave under 1.
 */
export function canAfford(world: ArpgWorld, ab: ResolvedAbility): boolean {
  const h = world.hero;
  if (world.sandbox?.infiniteMana || world.t < (h.freeCastUntil ?? 0)) return true;
  return h.boon.bloodPrice ? h.hp - lifeCost(h, ab.cost) >= 1 : h.mana >= ab.cost;
}

/**
 * Blood Price's life for a mana cost (the boons spec §2): `cost / manaMax × p ×
 * maxHp`; 0 without it, and for a charge move (its cost is 0).
 */
export function lifeCost(h: HeroEntity, cost: number): number {
  const p = h.boon.bloodPrice ?? 0;
  return p > 0 ? (cost / h.manaMax) * p * h.stats.maxHp : 0;
}
```

  In `pay`, replace:

```ts
  const free = ctx.world.t < (h.freeCastUntil ?? 0);
  if (free) h.freeCastUntil = 0;
  else h.mana -= ab.cost;
```

  with:

```ts
  const free = ctx.world.t < (h.freeCastUntil ?? 0);
  const blood = !free && !!h.boon.bloodPrice;
  if (free) h.freeCastUntil = 0;
  else if (blood) h.hp -= lifeCost(h, ab.cost);
  else h.mana -= ab.cost;
```

  and:

```ts
  const mana = sandbox?.infiniteMana || free ? 0 : ab.cost;
```

  with:

```ts
  const mana = sandbox?.infiniteMana || free || blood ? 0 : ab.cost;
```

  and in its doc comment replace `its mana, its own cooldown` with `its mana (under Blood Price, its life: \`lifeCost\`), its own cooldown`.

  In `packages/engine/src/arpg/basic.ts`, replace:

```ts
  if (landed) {
    h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
```

  with:

```ts
  if (landed) {
    // Under Blood Price (a boon) the basics give no mana.
    if (!h.boon.bloodPrice) h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
```

  In `packages/engine/src/arpg/combat.ts`, `hitMonster`, replace:

```ts
    if (opts.manaOnHit && h.drained[drain] < bal.runes.drainFoes && h.drainLeft[drain] > 0) {
```

  with:

```ts
    // Under Blood Price (a boon) Drain gives no mana, as the basics give none.
    const drains = opts.manaOnHit && !h.boon.bloodPrice;
    if (drains && h.drained[drain] < bal.runes.drainFoes && h.drainLeft[drain] > 0) {
```

  (then `Math.min(opts.manaOnHit, …)` below it is unchanged: `drains` implies it is set.)

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-combat.test.ts tests/ability-cast.test.ts tests/delve-chains.test.ts --reporter=dot)
```

  Fingerprint check: identical.

- [ ] **Step 5: Commit** (`cast.ts`, `basic.ts`, `combat.ts`, the test file): `feat(engine): Blood Price: abilities cost life, basics and Drain give no mana`.

### Task 8: `defendDuration`

**Files:**
- Modify: `packages/engine/src/arpg/abilities/forms.ts`, `packages/engine/tests/delve-boons-combat.test.ts`

- [ ] **Step 1: The failing test.** Append:

```ts
describe("the Defensive's duration (forms.ts buff)", () => {
  it('defendDuration lengthens its effect', () => {
    const warded = (x: number) => {
      const w = arena([dummy(13, 30)], { noBasic: true });
      if (x) wear(w, { defendDuration: x });
      press(w, 1);
      return w;
    };
    const plain = warded(0);
    const long = warded(0.5);
    const d = moveOf(plain, 1).duration;
    const cast = plain.hero.defend!.until - d;
    expect(long.hero.defend!.until - cast).toBeCloseTo(d * 1.5, 9);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **1 failed**.

- [ ] **Step 3: Implement.** In `packages/engine/src/arpg/abilities/forms.ts`, replace:

```ts
  // A Defensive move replaces the one up: its Ward (without a burst), Surge or Blink trail.
  const buff = (form: 'ward' | 'armor' | 'surge' | 'blink', until: number) => {
    h.ward = null;
```

  with:

```ts
  // A Defensive move replaces the one up: its Ward (without a burst), Surge or Blink trail,
  // for `seconds` × (1 + the boons' `defendDuration`).
  const buff = (form: 'ward' | 'armor' | 'surge' | 'blink', seconds: number) => {
    const until = t + seconds * (1 + (h.boon.defendDuration ?? 0));
    h.ward = null;
```

  and the four calls: `buff('ward', t + ab.duration);` → `buff('ward', ab.duration);`, `buff('armor', t + ab.duration);` → `buff('armor', ab.duration);`, `buff('surge', t + ab.duration);` → `buff('surge', ab.duration);`, `buff('blink', t + ctx.bal.abilities.defend.blinkSeconds);` → `buff('blink', ctx.bal.abilities.defend.blinkSeconds);`.

  (`t + seconds × 1` is exactly the old `t + ab.duration`.)

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-combat.test.ts tests/ability-cast.test.ts tests/delve-chains.test.ts tests/delve-stacks.test.ts --reporter=dot)
```

  Fingerprint check: identical.

- [ ] **Step 5: Commit** (`forms.ts`, the test file): `feat(engine): Bulwark lengthens the Defensive's effect`.

### Task 9: Last Stand

**Files:**
- Modify: `packages/engine/src/types/arpg.ts`, `packages/engine/src/arpg/combat.ts`, `packages/engine/tests/delve-boons-combat.test.ts`

- [ ] **Step 1: The failing test.** Append:

```ts
describe('Last Stand (combat.ts hurtHero)', () => {
  it('once a floor, crossing under its threshold takes less damage for its seconds', () => {
    const w = wear(arena([], { noBasic: true }), {
      lastStand: { below: 0.2, reduce: 0.5, seconds: 2 },
    });
    const ctx = ctxOf(w);
    const h = w.hero;
    const max = h.stats.maxHp;
    /** Life lost to a hit of `f` × max life, as a fraction of max life. */
    const hurt = (f: number) => {
      const before = h.hp;
      hurtHero(ctx, f * max, null, null, { unavoidable: true });
      return (before - h.hp) / max;
    };
    h.hp = 0.3 * max;
    expect(hurt(0.05)).toBeCloseTo(0.05, 9); // to 0.25: above it
    expect(hurt(0.1)).toBeCloseTo(0.1, 9); // to 0.15: the crossing hit lands in full
    expect(hurt(0.04)).toBeCloseTo(0.02, 9); // halved while it runs
    w.t += 2.1;
    expect(hurt(0.02)).toBeCloseTo(0.02, 9); // over
    h.hp = 0.5 * max;
    hurt(0.4); // crosses again: once a floor
    expect(hurt(0.02)).toBeCloseTo(0.02, 9);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **1 failed** (the third hit takes 0.04).

- [ ] **Step 3: Implement.** In `packages/engine/src/types/arpg.ts`, replace (as Task 6 left it):

```ts
  /** Free Cast (a boon): an ability paid before this time is free (absent: none). */
  freeCastUntil?: number;
```

  with:

```ts
  /** Free Cast (a boon): an ability paid before this time is free (absent: none). */
  freeCastUntil?: number;
  /** Last Stand (a boon) has fired on this floor. */
  lastStandUsed?: boolean;
  /** Last Stand's damage cut runs until this time. */
  lastStandUntil?: number;
```

  In `packages/engine/src/arpg/combat.ts`, `hurtHero`, replace:

```ts
  if (!opts.unavoidable) dmg *= 1 - armorReduction(bal, h.stats.armor, world.depth);
  dmg = shieldHero(ctx, dmg, source, !!opts.melee);
```

  with:

```ts
  if (!opts.unavoidable) dmg *= 1 - armorReduction(bal, h.stats.armor, world.depth);
  // Last Stand (a boon): less damage while it runs.
  if (world.t < (h.lastStandUntil ?? 0)) dmg *= 1 - (h.boon.lastStand?.reduce ?? 0);
  dmg = shieldHero(ctx, dmg, source, !!opts.melee);
```

  and:

```ts
  if (!blocked) h.hp -= dmg;
  h.lastHitAt = world.t;
```

  with:

```ts
  if (!blocked) h.hp -= dmg;
  // Last Stand starts as life first falls under its threshold on a floor.
  const stand = h.boon.lastStand;
  if (stand && !h.lastStandUsed && h.hp > 0 && h.hp < stand.below * h.stats.maxHp) {
    h.lastStandUsed = true;
    h.lastStandUntil = world.t + stand.seconds;
  }
  h.lastHitAt = world.t;
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-combat.test.ts tests/delve-dodge.test.ts tests/delve-stacks.test.ts --reporter=dot)
```

  Fingerprint check: identical.

- [ ] **Step 5: Commit** (`types/arpg.ts`, `combat.ts`, the test file): `feat(engine): Last Stand: less damage once life falls low, once a floor`.

### Task 10: Hunted's gear chance, and a floor-long barrier kept

Routed from B3 (the world fields): `gear` is read where an elite's gear chance is built, `combat.ts`'s `dropLoot`; and Stone Skin's barrier (B3's `barrierOnFloor`: `HeroEntity.barrier` with `until: Infinity`) must survive Obsidian and Guard, which today reset a barrier's `until` to seconds.

**Files:**
- Modify: `packages/engine/src/arpg/combat.ts`, `packages/engine/src/arpg/abilities/defend.ts`, `packages/engine/tests/delve-boons-combat.test.ts`

- [ ] **Step 1: The failing tests.** Add `guardLand` (`../src/arpg/abilities/defend.js`) to the imports. Append:

```ts
describe("Hunted's gear chance (combat.ts dropLoot)", () => {
  it("gear multiplies an elite's gear chance", () => {
    const items = (gear: number) => {
      const w = wear(arena([{ ...dummy(13, 30), kind: 'elite', hp: 1 }], { noBasic: true }), { gear });
      hitMonster(ctxOf(w), w.monsters[0], 100, null, { source: 'skill' });
      return w.drops.filter((d) => d.kind === 'item').length;
    };
    // `drops.elite.gearChance` is 0.5: × 2 always, × 0 never.
    expect([items(2), items(0)]).toEqual([1, 0]);
  });
});

describe('a floor-long barrier (Stone Skin)', () => {
  const floorBarrier = () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    w.hero.barrier = { hp: 1000, max: 1000, until: Infinity };
    return w;
  };

  /** Set off Obsidian (fire onto earth) under a barrier of `hp`; its `until` after. */
  const obsidian = (hp: number) => {
    const w = floorBarrier();
    w.hero.barrier!.hp = hp;
    const [m] = w.monsters;
    m.status.stacks.earth = 1;
    m.status.stackUntil.earth = 1e9;
    hitMonster(ctxOf(w), m, 10, 'fire', { source: 'skill', stacks: 1 });
    return w.hero.barrier!.until;
  };

  it('Obsidian, smaller or larger, keeps it floor-long', () => {
    expect(obsidian(1000)).toBe(Infinity); // smaller: extends
    expect(obsidian(1e-6)).toBe(Infinity); // larger: replaces
  });

  it('Guard, larger, takes it over and keeps it floor-long; on a timed barrier it times as before', () => {
    const w = floorBarrier();
    w.hero.barrier!.hp = 1;
    guardLand(ctxOf(w), { ...NEUTRAL, guardOnLand: 0.5 });
    expect(w.hero.barrier).toMatchObject({ hp: w.hero.stats.maxHp * 0.5, until: Infinity });
    w.hero.barrier = { hp: 1, max: 1, until: w.t + 1 };
    guardLand(ctxOf(w), { ...NEUTRAL, guardOnLand: 0.5 });
    expect(w.hero.barrier!.until).toBeCloseTo(w.t + bal.runes.guardSeconds, 9);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **3 failed** (both Obsidian paths reset `until` to seconds today; without the boon both kills roll the same 0.5 coin, so the pair can't be `[1, 0]`; both barriers end at seconds).

- [ ] **Step 3: Implement.** In `packages/engine/src/arpg/combat.ts`, `dropLoot`, replace:

```ts
          gear: world.door?.mods.gear ?? 1,
```

  with:

```ts
          // Hunted (a boon) multiplies it too.
          gear: (world.door?.mods.gear ?? 1) * (world.hero.boon.gear ?? 1),
```

  In `react`'s `case 'obsidian'`, replace:

```ts
      if (!h.barrier || hp > h.barrier.hp)
        h.barrier = { hp, max: hp, until: t + r.obsidianDuration };
      else h.barrier.until = t + r.obsidianDuration;
```

  with:

```ts
      // Never shorter: a floor-long barrier (Stone Skin) stays so, replaced or extended.
      if (!h.barrier || hp > h.barrier.hp) {
        const until = h.barrier?.until === Infinity ? Infinity : t + r.obsidianDuration;
        h.barrier = { hp, max: hp, until };
      } else h.barrier.until = Math.max(h.barrier.until, t + r.obsidianDuration);
```

  In `packages/engine/src/arpg/abilities/defend.ts`, `guardLand`, replace:

```ts
  h.barrier = { hp, max: hp, until: ctx.world.t + ctx.bal.runes.guardSeconds };
```

  with:

```ts
  // A floor-long barrier (Stone Skin) stays floor-long under a larger Guard.
  const until = h.barrier?.until === Infinity ? Infinity : ctx.world.t + ctx.bal.runes.guardSeconds;
  h.barrier = { hp, max: hp, until };
```

  (Exact without a boon: `x × 1`; an Obsidian extension's old `until` is never later than `t + obsidianDuration` today, since Guard's 3 s and Obsidian's 5 s both start at or before `t`; Guard keeps `Math.max` out on purpose, as it would lengthen a Guard over an Obsidian barrier with more than 3 s left.)

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-boons-combat.test.ts tests/delve-reactions.test.ts tests/delve-loot.test.ts tests/delve-stacks.test.ts --reporter=dot)
```

  Fingerprint check: identical.

- [ ] **Step 5: Commit** (`combat.ts`, `defend.ts`, the test file): `feat(engine): Hunted's gear chance; a floor-long barrier survives Obsidian and Guard`.

### Task 11: Verification

- [ ] **Step 1: The whole engine suite, the typecheck and the fingerprint.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

  Expected: the base counts plus this plan's 26 tests in one more file, all passing but the base's 2 known `delve-pacing-robust` failures, unchanged (no boon is worn). Fingerprint check: identical to `boons-b2-before.json`.

- [ ] **Step 2: The client still builds on the bundle.**

```bash
cd /c/Projects/alloy-boons-b2
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

  Expected: no type errors (the client calls `canAfford` and `stepBonus` with their old arguments, still valid); its suite as at the base. Nothing to commit. Hand the "Needs routed" list to the integrator.
