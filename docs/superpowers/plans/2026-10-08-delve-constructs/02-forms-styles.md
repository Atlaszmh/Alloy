# Delve constructs · B1: forms, styles, Detonate and the gate (engine) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three new forms play (Whirl spins, Repel pulses, Onslaught darts), the three shared forms have their melee versions (a Lance lunge, a Burst eruption, a Maelstrom that rides the hero), Surge runs every timer at one multiplier, Blink lands untouchable, Onslaught protects, Detonate blasts round each contact hit, and every weapon's cast style has real numbers, motion, a trait and a look on its events. The DPS Lab gains the `'style'` view and the style gate test; the existing Lab views and gates measure each form on its reference weapon. Every task here **changes play**, so every task re-records the fingerprint.

**Architecture:** No new module but the tests. The forms stay one `switch` in `forms.ts`, with a melee branch inside Lance, Burst and Maelstrom (`ab.form.melee` on a melee weapon) and one shared `sweep()` that Strike and Whirl play; the two moves that play out over ticks (Whirl's spin, Onslaught's darts) share one `HeroEntity.perform` state and one `performTick` after `echoTick`. Detonate, the dagger's crit and the axe's cleave are one handler each at the contact-hit sites (`impact.ts`); the wand's homing is one function beside Volley's `steer`; Surge is one `surgeMult` read where the timers are set and one `surgeTick` that advances the running ones; the style motion is one `styleMotion` push in `action.ts` called at the press and the release. The sword's step bonus needs a knob the contract doesn't name (`stepBonus`): it is added here as a fourth trait knob (see Needs routed).

**Tech Stack:** TypeScript 5.7, Vitest 3, React 19 (one Lab line).

**Spec:** `docs/superpowers/specs/2026-10-07-delve-weapon-identity-and-constructs-design.md` §2 (forms and classes), §2.3 (Detonate), §4 (cast styles, the gate), §11 (risks). The contract is `00-overview.md` "The contract" (the style pipeline, `FormDef.melee`, the `look` field, the Detonate knob and row, the three new rows dispatched to placeholders).

---

## Base

- **Starts from:** `constructs/main` with Phase A merged, in this area's worktree:

```bash
cd /c/Projects/Alloy
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad/mkwt.ps1 -Name alloy-constructs-b1 -Branch constructs/b1 -Base constructs/main
```

  Every path below is relative to `/c/Projects/alloy-constructs-b1`. Every command block starts there.
- **Anchors:** written against `main` at `2f3871b2` plus the contract as `00-overview.md` states it. Where A's contract changes a file first, the edit is written against the contract's shape and says so: `resolveAbility`'s `const base = applyStyle(form, stats.weapon.class, style)` and `const own = [style?.trait ?? {}, …]` (A's), `ResolvedAbility.look`, `HeroWeapon.class`/`style`, `FormDef.class`/`melee`, the `whirl`/`repel`/`onslaught` rows and their placeholder cases (`// B1 replaces`), `Knobs.detonate`/`critBonus`/`cleave`/`homing` in `NEUTRAL`, `mergeKnobs` and `KnobsSchema`, `defaultForm(registry, slot, cls)`, `formAllowed`, `weaponClass`. If an anchor doesn't match, find the same statement and apply the same change.
- **What A gives this plan** (relied on, not built here): the three form rows (`whirl`: primary, melee, power 1.1, radius 2.4, duration 1.5, tick 0.5; `repel`: defensive, ranged, power 0.6, effect 0.5, radius 3; `onslaught`: ultimate, melee, power 1.2, range 6, radius 3, count 5, duration 1.2) each dispatched to a placeholder; `class` on every form and weapon base; a `style` row on every weapon base with every number 1, `motion: 'none'`, `trait: {}` and its `look`; the Detonate rune row and the `detonate` knob (0 in `NEUTRAL`, added in `mergeKnobs`, in `KnobsSchema`), likewise `critBonus`, `cleave`, `homing`; `applyStyle` (FormDef fields × `style.numbers`, the `melee` block first on a melee weapon) and `ResolvedAbility.look`; `look?` on the `cast`, `hit`, `beam`, `slash`, `explode` and `dash` events (set on `cast`); `signatureFor` asked at the top of `executeForm`.
- **Before Task 1:** build once and measure the suites you'll keep green:

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run --reporter=dot)
```

  Expected: tsup's "Build success" lines, no type errors, every test passing but the 2 known `delve-pacing-robust` failures; write down the counts.
- **The fingerprint.** A's probe (`01-contract.md`, "The fingerprint"); if you don't have it, the boons plan's text (`docs/superpowers/plans/2026-10-07-delve-boons/03-combat-fields.md`, "The fingerprint, before") is the same file: save it in your scratchpad (`$P`) as `b1-probe.test.ts`, never committed. Record it once before Task 1:

```bash
cd /c/Projects/alloy-constructs-b1
P=<your scratchpad>
cp $P/b1-probe.test.ts packages/engine/tests/zz-probe.test.ts
(cd packages/engine && PROBE_OUT=$P/b1-before.json npx vitest run tests/zz-probe.test.ts)
rm packages/engine/tests/zz-probe.test.ts
```

  **Every task here changes play** (a new form the bot may hold after a drop, a melee Lance on the bot's sword, Surge's timers, the sword's step bonus…), so each task ends by **re-recording**: the same three commands writing `b1-after.json`, then `cmp` to show it moved (expected: a difference; if `cmp` prints nothing, the task's behaviour never reached the bot: check why before committing) and `cp $P/b1-after.json $P/b1-before.json`. Keep every `b1-after-<task>.json` (D2 reads the run of them).

## Files

| File | Change |
|---|---|
| `packages/engine/src/arpg/abilities/impact.ts` | `lookOf`; `detonate` (Task 1); `cleaveBehind`, `hitOpts` carries `critBonus` (Task 10); `impact()` sets `look` on `explode` and calls both |
| `packages/engine/src/arpg/abilities/forms.ts` | `sweep()` out of Strike; Whirl (Task 2); Repel (Task 3); Onslaught and `performTick` (Task 4); the melee Lance, Burst and Maelstrom (Task 5); `look` on `beam`, `slash`, `dash` (Tasks 2–5) |
| `packages/engine/src/arpg/abilities/defend.ts` | `surgeMult`, `surgeTick`; `gainCharge` × Surge (Task 6) |
| `packages/engine/src/arpg/abilities/cast.ts` | `styleMotion` at the press and the release (Task 9); `stepBonus`'s knob extra (Task 10) |
| `packages/engine/src/arpg/abilities/resolve.ts` | the style's wind-up, cooldown and arc factors (Task 8); `stepBonus` knob in `NEUTRAL`/`mergeKnobs`, `moveNumbers` (Task 10) |
| `packages/engine/src/arpg/action.ts` | `styleMotion` (Task 9) |
| `packages/engine/src/arpg/basic.ts` | `haste` → `surgeMult` (Task 6) |
| `packages/engine/src/arpg/dodge.ts` | nothing: Surge advances `dodgeRechargeAt` in `surgeTick` (Task 6) |
| `packages/engine/src/arpg/step.ts` | `performTick` after `echoTick` (Task 2); `follow` zones (Task 5); Surge's regen and pace, `surgeTick` (Task 6); `homingTick` (Task 10). Claimed here: no other area edits `step.ts` |
| `packages/engine/src/arpg/combat.ts` | Onslaught's guard in `hurtHero` (Task 4); `HitOpts.critBonus` and its roll (Task 10). Claimed here |
| `packages/engine/src/arpg/abilities/targeting.ts` | `PLACED` gains `onslaught` (Task 4). Claimed here |
| `packages/engine/src/types/arpg.ts` | `HeroEntity.perform?`, `onslaughtGuard?` (Tasks 2, 4); `Zone.follow?` (Task 5). See Needs routed |
| `packages/engine/src/types/delve.ts`, `src/data/schemas.ts` | `abilities.defend`: `onslaughtGuard` in, `surgeMove` out (Tasks 4, 6); `feel.styleMove` (Task 9); `KnobsSchema.stepBonus` (Task 10). See Needs routed |
| `packages/engine/src/types/ability.ts` | `Knobs.stepBonus` (Task 10). See Needs routed |
| `packages/engine/src/data/arpg.json` | Surge's and Blink's rows (Tasks 6, 7); the `melee` blocks (Task 5); Repel's text (Task 3) |
| `packages/engine/src/data/balance.json` | `delve.abilities.defend` (Tasks 4, 6), `delve.feel.styleMove` (Task 9): sections A doesn't own |
| `packages/engine/src/data/delve.json` | the seven `style` rows' numbers, motion, trait, look and `text` (Task 8) |
| `packages/engine/src/delve/hero-stats.ts` | `TARGETS`/`repeatsOf` for the new forms (Task 2–4); Power's Detonate (Task 1) and trait terms (Task 10) |
| `packages/engine/src/arpg/dps-sim.ts` | `referenceWeapons`; the ability and rune views on them; the `'style'` view (Task 11) |
| `packages/engine/src/index.ts` | exports `referenceWeapons`, `surgeMult` (Task 11) |
| `packages/engine/tests/fixtures/arena.ts` | `ArenaOpts.weapon` (Task 5) |
| `packages/engine/tests/delve-forms-styles.test.ts` (new) | one `describe` a task |
| `packages/engine/tests/delve-style-gate.test.ts` (new) | the gate (Task 12) |
| `packages/engine/tests/ability-forms.test.ts` and the sim tests listed in Task 5 | the ranged expectations re-homed on a staff |
| `packages/engine/tests/delve-rune-costs-gate.test.ts`, `tests/delve-dps-sim.test.ts` | the reference weapons (Task 11) |
| `packages/client/src/pages/DelveLab.tsx` | the `Styles` view entry (Task 11; the one client line) |

Not touched: `loot/`, `delve/moveset.ts`, `delve/constructs.ts` (B2's), the client beyond the Lab line (C's), `autopilot.ts` (D1's).

## Needs routed

For the integrator, applied or merged at the area's merge:

1. **`types/arpg.ts` (A's for `FormDef` and the events):** B1 adds three optional fields elsewhere in the file: `HeroEntity.perform?` and `onslaughtGuard?` (after `lastStandUntil?`, Tasks 2 and 4) and `Zone.follow?` (after `heft?`, Task 5). Merge beside A's edits.
2. **`types/delve.ts` and `data/schemas.ts` (A's balance):** `AbilitiesBalance.defend` loses `surgeMove` and gains `onslaughtGuard: number` (Tasks 4, 6); `FeelBalance` gains `styleMove: Record<StyleMotion, number>` (Task 9); `KnobsSchema` gains `stepBonus: z.number().min(0)` (Task 10). `balance.json`'s matching keys are B1's (sections A doesn't own).
3. **`types/ability.ts` (A's):** `Knobs.stepBonus: number` (Task 10), the sword's trait: the spec's "step bonus +0.05 a chain step" has no existing knob to ride (`stepBonus(bal, index, extra)` takes an `extra`, but a style trait is a `KnobsData`). If A prefers, A adds it with the other three; B1's Task 10 adds it where it's missing.
4. **`combat.ts`, `step.ts`, `targeting.ts`:** B1's edits are named in Files; no other area touches these lines (B2 edits none of the three; C and D neither).
5. **`src/index.ts` (A's):** `referenceWeapons` from `./arpg/dps-sim.js` beside `runeComboSetups`; `surgeMult` from `./arpg/abilities/defend.js` beside `guardLand` (the HUD may read it later). B1 adds the lines; merge.
6. **D1 (the bot):** `botInput` casts whatever the chains hold; nothing here needs it. The fingerprint moves at each task: D1 starts from B1's last `b1-after.json`.
7. **D2 (docs):** CLAUDE.md gains the forms-by-class and cast-styles section (the names here: `sweep`, `performTick`, `detonate`, `cleaveBehind`, `homingTick`, `surgeMult`/`surgeTick`, `styleMotion`, `referenceWeapons`, the `'style'` view, the gate's `STYLE_GATE`).
8. **C2 (the arena's look):** `look` rides `beam`, `slash`, `explode` and `dash` (never `hit`: the coordinator's note), from `ResolvedAbility.look`; a basic shot's `explode` and a monster's carry none.
9. **C2 (the item header):** each style row's `text` (Task 8) is the trait as the player reads it ("Casts gain 15% crit chance"). It needs `CastStyle.text: string` (`types/arpg.ts`, A's) and `text: z.string().min(1)` in A's style schema (`schemas.ts`): A adds both (the overview's Integrator notes); Task 8 adds them only where missing.
10. **C2 (the Lab page):** `packages/client/src/pages/DelveLab.tsx`'s `VIEWS` gains `['style', 'Styles']` (Task 11, the one client line; the page is outside `features/delve/lab/`): B1 adds it; C2 owns the file otherwise.

## Where the spec left room

1. **Whirl's hits are direct** (a Primary's, with their stacks and heavy payoff), one `sweep` a beat (0, 0.5, 1.0 s: three), the first beat chaining and leaving the zone as Strike's one swing does; the hero walks at `actionMove` (0.6×) while it spins, as during a swing; a second Whirl pressed mid-spin starts the spin over. An Echo of a Whirl replays its first beat only (the spin isn't re-queued): an Echo's `executeForm` runs with `replay`, and the Whirl case starts no `perform` then.
2. **Onslaught** darts `count` times over `duration` (every 0.24 s) between the living foes within its radius + 1 of the aim point that the hero perceives, never the one it struck last while another stands, each dart a `dash` to the foe's contact gap (walls stop it) and one direct hit with a `slash`; the hero is invulnerable from the cast for `duration` and then takes `effect` (30%) less damage for `abilities.defend.onslaughtGuard` (2 s). With no foe in the area it ends at once (the guard still comes). The hero can walk between darts (nothing roots it); a dodge drops nothing of it. An Echo's replay is one dart that strikes from where the hero stands (it still moves to the foe's gap, like any dart) with no invulnerability and no guard.
3. **Repel** pushes with `effect × 2` knockback (Earth's knob is 1) and chills (`chill` stacks: the engine's one slow); it clears the Defensive up, as Blink does, and leaves none. A Fire Repel's chill sets up a Melt for the next Fire hit: accepted (it is how stacks work).
4. **The melee Lance** lunges `melee.range` (5) along the line to the first wall and strikes every foe within `melee.radius` (0.8) of the segment that either end sees, from the nearest; no i-frames; Multi-shot's fan is one lunge (its extra beams are ignored on the lunge; the gate reads it). **The melee Burst** is one impact at the aim point within `melee.range` (5), at once. **The melee Maelstrom** is a zone with `follow: true`, moved to the hero each tick before it ticks; its `melee.range` is 0 and `motion` 0 (the aim point is ignored).
5. **Surge** is `1 + effect` (0.3 → ×1.3) read by `surgeMult`: attack speed (`basic.ts`'s cycle, as today), move speed (in place of `surgeMove`, retired), mana regen and charge gain where they are set, and every running timer advanced by `dt × (mult − 1)` each tick in `surgeTick`: the cooldowns (never the Surge move's own), the beats (`beatUntil` and, while the beat runs, `comboAt`, so the restart window isn't shortened), a wind-up's `until` and `conjureUntil`, and `dodgeRechargeAt`. A hold's charge is not a listed timer and stays. A charge-paid Surge refills its own meter faster too (`gainCharge` × the multiplier reaches every charge chain): accepted, its lockout and its own cooldown are untouched.
6. **Blink's landing invulnerability** is data: the engine's Blink lands on the cast tick, so "0.5 s after landing" is `effect` 0.4 → 0.9 and the row's text. Power's Blink term (`0.3 × uptime`) stays.
7. **Detonate** blasts `DETONATE_RADIUS` (1.5) round each foe a contact hit strikes (Strike's and Whirl's sweeps, the Lance's beam and lunge, Onslaught's darts, and Volley's darts through `impact`), hitting every other foe the foe's point sees for `hit × detonate` as a non-direct skill hit (tick stacks, no heavy payoff, no chain, zone or shards); the struck foe itself is not in its blast. It fires on contact only, never on an Echo's replay (`detonate` returns on `ab.replay`), and on the rune's five forms only (`fits.forms`); `impact()`'s site is reached by Volley alone.
8. **The axe's cleave** is `cleaveBehind`: when a direct hit struck exactly one foe (an `impact` with one foe in it, an Onslaught dart), the foes within `cleave` (1.2) of it and beyond it from the hero take half the hit, non-direct. **The wand's homing** turns an ability's shot (`p.ability`, not already homing: no Volley dart, no shard) toward the nearest foe within 6 it perceives by at most `homing` radians a second. **The dagger's crit** adds `critBonus` to the roll of every hit the move's `hitOpts` builds. **The maul's stagger** is `applies: ['stagger']` on every kind (the spec's "heavy and hold moves" would need a kind-gated knob; the maul staggering on every cast is its identity, and `staggerImmunity` keeps it from locking a foe). **The staff's zone** is `{ seconds: 1, tickPower: 0.1, perCast: 3 }`: `perCast` 3 equals Linger's, so `mergeKnobs`'s min never cuts a Linger on a staff. **The bow's pierce** is `pierce: 1` (an Earth move's Infinity swallows it).
9. **Style motion** is a push by the style's `motion` and `feel.styleMove[motion]` units: at the press, toward the aim, `dart` (the dagger, a `stepIn` push that finishes before the move lands) and `wade` (the axe); at the release, `step` (the sword, forward), `plant` (the maul's hop forward), `back` (the bow, backward), `sway` (the staff, square to the aim on the side the blows' `swaySide` flips) and `orbit` (the wand, square on the side `swaySide` keeps). A self-centred form (no way to its aim) gets none. It adds to the form's own motion: the pushes run beside the step-in and the recoil.
10. **The style's arc** uses the radius factor (`numbers.radius`: the axe's "radius and arc +20%"), capped at 360; the wind-up and cooldown factors apply in `resolveAbility` (a `FormDef` holds neither), the cooldown's to the slot's cooldown, never the charge lockout.
11. **The gate measures the Primary and the Ultimate forms** (a Defensive's DPS says nothing of it: a Surge deals 0); each weapon × allowed attack form, Fire, the form's default chain at its slot's default payment, depth 10, full mana, one dummy and the pack, eight seeds. The band applies per layout.
12. **`TARGETS`** (Power's foes an impact lands on): `whirl` 2 with `repeatsOf` its beats (duration / tick), `repel` 2.5, `onslaught` 1 with `repeatsOf` its count.
13. **Tests** live in one new file, `delve-forms-styles.test.ts`, a `describe` a task, and the fixture gains `ArenaOpts.weapon` so a test picks a staff for the ranged version (the fixture's default weapon is a sword, a melee weapon: the melee Lance, Burst and Maelstrom change it).

## Conventions

- One commit a task, staged by path, ending with `-m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`. Never push or merge.
- Keep each file's line endings (the Edit tool does); new files are LF. Format only the new test files (`npx prettier --write --end-of-line auto`). Never reformat `balance.json` or `hero-stats.ts`.
- "Replace … with …" is one Edit; within a file apply edits top to bottom.
- Every task runs `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot)` and re-records the fingerprint.
- Expected outputs below are **expectations** (A isn't built as this is written), not observations: a count that differs by a test or two is the suite as A left it, not a failure of the task.

---

## Chunk 1: Detonate, Whirl, Repel

### Task 1: Detonate

**Files:**
- Create: `packages/engine/tests/delve-forms-styles.test.ts`
- Modify: `packages/engine/src/arpg/abilities/impact.ts`, `packages/engine/src/arpg/abilities/forms.ts`, `packages/engine/src/delve/hero-stats.ts`

- [ ] **Step 1: The failing tests.** Create `packages/engine/tests/delve-forms-styles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeCtx, hurtHero } from '../src/arpg/combat.js';
import { damagePerUse, expectedHit } from '../src/delve/hero-stats.js';
import { resolveChain } from '../src/arpg/abilities/resolve.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import type { Chain } from '../src/types/ability.js';
import {
  arena,
  bal,
  damaged,
  dummy,
  gear,
  moveOf,
  press,
  registry,
  run,
  STEP,
} from './fixtures/arena.js';

// The constructs spec §2 (forms), §2.3 (Detonate), §4 (cast styles). The hero starts at
// (13, 36) facing up (−y); the fixture's weapon is a sword (melee).

type Hit = Extract<ArpgEvent, { kind: 'hit' }>;
const hits = (events: ArpgEvent[], id: number) =>
  events.filter((e): e is Hit => e.kind === 'hit' && e.id === id);
const DETONATE = { id: 'detonate', tier: 3 } as const;

describe('Detonate (impact.ts)', () => {
  it("a Strike's contact hit blasts the foes round the foe it struck, never the foe itself twice", () => {
    const w = arena([dummy(13, 34.4), dummy(13, 32.6), dummy(13, 24)], {
      noBasic: true,
      primary: { form: 'strike', runes: [DETONATE] },
    });
    w.hero.stats = { ...w.hero.stats, critChance: 0 };
    const events = press(w, 0);
    const [near, behind, far] = w.monsters;
    // The sweep reaches the near foe only; its blast reaches the one behind it.
    expect(hits(events, near.id)).toHaveLength(1);
    expect(hits(events, behind.id)).toHaveLength(1);
    expect(damaged(far)).toBe(false);
    const k = moveOf(w, 0).knobs.detonate;
    expect(k).toBeGreaterThan(0);
    expect(hits(events, behind.id)[0].amount).toBeCloseTo(hits(events, near.id)[0].amount * k, 6);
  });

  it('a Bolt (no fit) and a tick never detonate; Power counts it', () => {
    const w = arena([dummy(13, 30), dummy(13, 28.2)], {
      noBasic: true,
      primary: { form: 'bolt', runes: [DETONATE] },
    });
    expect(moveOf(w, 0).knobs.detonate).toBe(0);
    const chain = (runes: (typeof DETONATE)[]): Chain => ({
      moves: [{ kind: 'medium', form: 'strike', elements: ['fire'], runes }],
      payment: 'mana',
    });
    const stats = w.hero.stats;
    const value = (c: Chain) =>
      damagePerUse(resolveChain(registry, stats, 'primary', c), expectedHit(stats), stats, bal);
    expect(value(chain([DETONATE]))).toBeGreaterThan(value(chain([])) * 0.9);
  });
});
```

  (`expectedHit` is exported from `hero-stats.ts`; if not, export it: it is the one-line expected hit with crit.)

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx vitest run tests/delve-forms-styles.test.ts --reporter=dot)
```

  Expected: **2 failed** (the foe behind is never hit; Power ignores the knob).

- [ ] **Step 3: Implement.** In `packages/engine/src/arpg/abilities/impact.ts`, replace:

```ts
/** A Split shard's size: it hits what it touches. */
const SHARD_RADIUS = 0.2;
```

  with:

```ts
/** A Split shard's size: it hits what it touches. */
const SHARD_RADIUS = 0.2;
/** Detonate's blast round a foe a contact hit struck (the constructs spec §2.3). */
const DETONATE_RADIUS = 1.5;

/** The move's style look for an event (`ResolvedAbility.look`): nothing without one. */
export function lookOf(ab: ResolvedAbility): { look?: NonNullable<ResolvedAbility['look']> } {
  return ab.look ? { look: ab.look } : {};
}

/**
 * Detonate (the constructs spec §2.3): a contact hit on `m` sets off a blast of
 * `knobs.detonate` × `damage` round it, on every other foe the foe's point sees
 * within `DETONATE_RADIUS`, as a non-direct skill hit (tick stacks; no chain,
 * zone or shards of its own). The struck foe is not in its own blast. Nothing
 * without the knob.
 */
export function detonate(ctx: SimCtx, ab: ResolvedAbility, m: MonsterEntity, damage: number): void {
  const k = ab.knobs.detonate;
  // Contact only: an Echo's replay sets nothing off.
  if (k <= 0 || ab.replay) return;
  const { world } = ctx;
  const at = { x: m.x, y: m.y };
  ctx.events.push({
    kind: 'explode',
    x: at.x,
    y: at.y,
    radius: DETONATE_RADIUS,
    element: ab.element,
    infusion: null,
    ...lookOf(ab),
  });
  const opts = hitOpts(ab, at, false, false, 0);
  for (const o of alive(ctx)) {
    if (o === m || dist(at.x, at.y, o.x, o.y) > DETONATE_RADIUS + o.radius) continue;
    if (!sees(world.map, at, o)) continue;
    hitMonster(ctx, o, damage * k, ab.element, opts);
  }
}
```

  In `impact()`, replace:

```ts
  const opts = hitOpts(ab, o.from ?? { x, y }, o.tick, !o.tick, o.heft ?? ab.heft);
  for (const m of hits) hitMonster(ctx, m, damage, ab.element, opts);
```

  with:

```ts
  const opts = hitOpts(ab, o.from ?? { x, y }, o.tick, !o.tick, o.heft ?? ab.heft);
  for (const m of hits) hitMonster(ctx, m, damage, ab.element, opts);
  // Detonate: each foe a direct impact struck (a Volley dart's) blasts round itself.
  if (!o.tick && !o.through) for (const m of hits) detonate(ctx, ab, m, damage);
```

  and in the same function set the look on its event: replace

```ts
      infusion: o.tick ? null : (ab.elements[1] ?? null),
    });
```

  with:

```ts
      infusion: o.tick ? null : (ab.elements[1] ?? null),
      ...lookOf(ab),
    });
```

  In `packages/engine/src/arpg/abilities/forms.ts`, replace the import line

```ts
import { abilityHit, chainFrom, hitOpts, impact, leaveZone } from './impact.js';
```

  with:

```ts
import { abilityHit, chainFrom, detonate, hitOpts, impact, leaveZone, lookOf } from './impact.js';
```

  In the `lance` case, replace:

```ts
        for (const m of hits) {
          struck.add(m.id);
          hitMonster(ctx, m, hit, ab.element, opts);
        }
```

  with:

```ts
        for (const m of hits) {
          struck.add(m.id);
          hitMonster(ctx, m, hit, ab.element, opts);
          detonate(ctx, ab, m, hit);
        }
```

  and its `beam` event gains `...lookOf(ab),` after `infusion: ab.elements[1] ?? null,`. In the `strike` case, replace:

```ts
      const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
      for (const m of hits) hitMonster(ctx, m, hit, ab.element, opts);
```

  with:

```ts
      const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
      for (const m of hits) {
        hitMonster(ctx, m, hit, ab.element, opts);
        detonate(ctx, ab, m, hit);
      }
```

  and its `slash` event gains `...lookOf(ab),` after `infusion: ab.elements[1] ?? null,`. (Whirl's and Onslaught's sites come with their tasks.)

  In `packages/engine/src/delve/hero-stats.ts`, replace:

```ts
  const shards = k.split ? EXTRA_SHOT * k.split.count * k.split.power : 0;
  return targets + pierced + jumps + zone + shards;
```

  with:

```ts
  const shards = k.split ? EXTRA_SHOT * k.split.count * k.split.power : 0;
  // Detonate: each foe struck blasts round itself, finding a foe half the time.
  const blasts = EXTRA_SHOT * k.detonate * targets;
  return targets + pierced + jumps + zone + shards + blasts;
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-forms-styles.test.ts tests/ability-forms.test.ts tests/delve-rune-sim.test.ts tests/delve-rune-power.test.ts --reporter=dot)
```

  Expected: no type errors; all pass. Re-record the fingerprint (it moves only if a bot run socketed a Detonate drop: with none, `cmp` may print nothing here; that is the one task where an identical fingerprint is fine).

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx prettier --write --end-of-line auto tests/delve-forms-styles.test.ts)
git add packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-forms-styles.test.ts
git commit -m "feat(engine): Detonate blasts round each foe a contact hit strikes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: Whirl

**Files:**
- Modify: `packages/engine/src/types/arpg.ts`, `packages/engine/src/arpg/abilities/forms.ts`, `packages/engine/src/arpg/step.ts`, `packages/engine/src/delve/hero-stats.ts`, `packages/engine/tests/delve-forms-styles.test.ts`

- [ ] **Step 1: The failing tests.** Append:

```ts
describe('Whirl (forms.ts performTick)', () => {
  const whirl = { kind: 'medium', form: 'whirl', elements: ['fire'] } as const;

  it('spins: a sweep all round now and every tick for its duration, the hero walking slowed meanwhile', () => {
    const w = arena([dummy(13, 34.4), dummy(13, 37.8)], { noBasic: true, primary: { ...whirl } });
    const form = registry.getForm('whirl');
    const beats = Math.round(form.duration! / form.tick!);
    // A short walk (at `actionMove`, as a swing's), then standing: every beat still reaches both.
    const events = [
      ...press(w, 0),
      ...run(w, 0.2, { x: 1, y: 0 }),
      ...run(w, form.duration! - 0.1, { x: 0, y: 0 }),
    ];
    for (const m of w.monsters) expect(hits(events, m.id)).toHaveLength(beats);
    const walked = w.hero.x - 13;
    expect(walked).toBeGreaterThan(0.3);
    expect(walked).toBeLessThan(w.hero.stats.moveSpeed * 0.2 * bal.feel.actionMove + 0.1);
    expect(w.hero.perform ?? null).toBeNull();
    expect(events.filter((e) => e.kind === 'slash' && e.arc === 360)).toHaveLength(beats);
  });

  it("its hits are direct (a chain's first move's stacks), and a second press starts the spin over", () => {
    const w = arena([dummy(13, 34.4)], { noBasic: true, primary: { ...whirl } });
    const events = press(w, 0);
    expect(w.monsters[0].status.stacks.fire).toBe(moveOf(w, 0).stacks);
    expect(hits(events, w.monsters[0].id)[0].source).toBe('skill');
    run(w, 0.3);
    w.hero.cooldowns[0][0] = 0;
    w.hero.beatUntil[0] = 0;
    press(w, 0);
    expect(w.hero.perform?.struck).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **2 failed** (A's placeholder plays Whirl as a Strike: one sweep, no `perform`).

- [ ] **Step 3: Implement.** In `packages/engine/src/types/arpg.ts`, in `HeroEntity`, replace:

```ts
  /** Last Stand's damage cut runs until this time. */
  lastStandUntil?: number;
```

  with:

```ts
  /** Last Stand's damage cut runs until this time. */
  lastStandUntil?: number;
  /**
   * A move playing out over ticks (the constructs spec §2.2): a Whirl's spin or
   * an Onslaught's darts, a beat every `every` seconds from `nextAt`, `left`
   * to go, `struck` landed; `performTick` lands them. A new one replaces it.
   */
  perform?: {
    form: 'whirl' | 'onslaught';
    ability: ResolvedAbility;
    hit: number;
    heft: number;
    size: number;
    nextAt: number;
    every: number;
    left: number;
    struck: number;
    /** Onslaught: the target area's centre, and the foe struck last. */
    at: Vec;
    lastId: number | null;
  } | null;
```

  In `packages/engine/src/arpg/abilities/forms.ts`, replace the `strike` case's body from `h.facing = dir;` to its `return` with a call to `sweep`, and add `sweep` and `performTick`. Replace:

```ts
    case 'strike': {
      h.facing = dir;
      // The last move of a chain slams all around.
      const slam = ab.last;
      const arc = slam ? 360 : ab.arc;
      const reach = ab.radius * (slam ? 1.15 : 1);
```

  with:

```ts
    case 'strike': {
      h.facing = dir;
      // The last move of a chain slams all around.
      const slam = ab.last;
      const arc = slam ? 360 : ab.arc;
      const reach = ab.radius * (slam ? 1.15 : 1);
      sweep(ctx, ab, hit, heft, reach, arc, dir, true);
      return done(h.x + dir.x * reach, h.y + dir.y * reach);
    }
    case 'whirl': {
      // The spin (the constructs spec §2.2): a sweep all round now and every `tick` for
      // `duration`, the hero free to walk (`performTick`). An Echo replays one sweep.
      h.facing = dir;
      const reach = ab.radius * size;
      if (ab.replay) {
        sweep(ctx, ab, hit, heft, reach, 360, dir, true);
        return done(h.x, h.y);
      }
      h.perform = {
        form: 'whirl',
        ability: ab,
        hit,
        heft,
        size,
        nextAt: t,
        every: ab.tick,
        left: Math.max(1, Math.round(ab.duration / ab.tick)),
        struck: 0,
        at: { x: h.x, y: h.y },
        lastId: null,
      };
      return done(h.x, h.y);
    }
```

  then delete the rest of the old `strike` body (from `const half = (arc * Math.PI) / 360;` through its `return done(h.x + dir.x * reach, h.y + dir.y * reach);\n    }`), and insert above `export function executeForm(`:

```ts
/**
 * A melee sweep from where the hero stands (Strike's, Whirl's): every foe it
 * sees within `reach` and `arc` round `dir` takes a direct hit (Detonate
 * blasting round each), a `slash` marks it, and, not an Echo's, it reaches
 * the room objects and (a heavy or hold move's) crumbling cover. With `first`
 * its Chain jumps from the first foe and its zone is left ahead. Returns the
 * foes hit.
 */
function sweep(
  ctx: SimCtx,
  ab: ResolvedAbility,
  hit: number,
  heft: number,
  reach: number,
  arc: number,
  dir: Vec,
  first: boolean,
): MonsterEntity[] {
  const { world } = ctx;
  const h = world.hero;
  const half = (arc * Math.PI) / 360;
  const hits = alive(ctx).filter(
    (m) =>
      dist(h.x, h.y, m.x, m.y) - m.radius <= reach &&
      (arc >= 360 || angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) <= half) &&
      sees(world.map, h, m),
  );
  ctx.events.push({
    kind: 'slash',
    x: h.x,
    y: h.y,
    dir,
    range: reach,
    arc,
    element: ab.element,
    heft,
    infusion: ab.elements[1] ?? null,
    ...lookOf(ab),
    ...(ab.replay ? { echo: true as const } : {}),
  });
  const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
  for (const m of hits) {
    hitMonster(ctx, m, hit, ab.element, opts);
    detonate(ctx, ab, m, hit);
  }
  if (!ab.replay) {
    for (const obj of objectsIn(world, h, reach, dir, arc)) hitObject(ctx, obj, 'hero');
    if (ab.kind === 'heavy' || ab.kind === 'hold') hitStructures(ctx, h, reach, hit, dir, arc);
  }
  if (first && hits.length > 0) {
    chainFrom(ctx, ab, hits[0], hit, new Set(hits.map((m) => m.id)));
    leaveZone(ctx, ab, h.x + dir.x * reach * 0.5, h.y + dir.y * reach * 0.5, reach * 0.7, hit);
  }
  return hits;
}

/**
 * Land the beats of the move playing out (`HeroEntity.perform`), one a tick at
 * most: a Whirl's sweep all round where the hero stands (its first beat
 * chaining and leaving its zone). Called after `echoTick`.
 */
export function performTick(ctx: SimCtx): void {
  const { world } = ctx;
  const h = world.hero;
  const o = h.perform;
  if (!o || world.t < o.nextAt - 1e-9) return;
  const ab = o.ability;
  if (o.form === 'whirl') sweep(ctx, ab, o.hit, o.heft, ab.radius * o.size, 360, h.facing, o.struck === 0);
  o.struck++;
  o.left--;
  o.nextAt += o.every;
  if (o.left <= 0) h.perform = null;
}
```

  Add `MonsterEntity` to the `../../types/arpg.js` type import. In `packages/engine/src/arpg/step.ts`, replace:

```ts
import { executeForm } from …
```

  (there is none: add) `import { performTick } from './abilities/forms.js';` after the `echo.js` import, and replace:

```ts
  castTick(ctx);
  echoTick(ctx);
```

  with:

```ts
  castTick(ctx);
  echoTick(ctx);
  performTick(ctx);
```

  and, so a spinning hero walks slowed as a swinging one does (`actionMove`), replace:

```ts
  const acting = !!h.swing || !!h.windup || !!h.hold;
```

  with:

```ts
  // A Whirl's spin acts too: the hero walks slowed and faces its way (the constructs spec §2.2).
  const acting = !!h.swing || !!h.windup || !!h.hold || h.perform?.form === 'whirl';
```

  (`actionFacing` returns null for it, so the facing follows the steering.) In `packages/engine/src/delve/hero-stats.ts`, in `TARGETS` add `whirl: 2,` after `strike: 2,` (A may have put a placeholder there: set it to 2), and replace:

```ts
function repeatsOf(ab: ResolvedAbility): number {
  return ab.form.id === 'barrage'
    ? ab.count
    : ab.form.id === 'maelstrom'
      ? ab.duration / ab.tick
      : 1;
}
```

  with:

```ts
function repeatsOf(ab: ResolvedAbility): number {
  const f = ab.form.id;
  if (f === 'barrage' || f === 'onslaught') return ab.count;
  if (f === 'maelstrom' || f === 'whirl') return ab.duration / ab.tick;
  return 1;
}
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-forms-styles.test.ts tests/ability-forms.test.ts tests/delve-chains.test.ts tests/delve-room-hits.test.ts --reporter=dot)
```

  Expected: no type errors; all pass (Strike's own test unchanged: `sweep` is its body). Re-record the fingerprint.

- [ ] **Step 5: Commit** (`types/arpg.ts`, `forms.ts`, `step.ts`, `hero-stats.ts`, the test): `feat(engine): Whirl spins, a sweep a beat, the hero free to walk`.

### Task 3: Repel

**Files:**
- Modify: `packages/engine/src/arpg/abilities/forms.ts`, `packages/engine/src/data/arpg.json`, `packages/engine/src/delve/hero-stats.ts`, `packages/engine/tests/delve-forms-styles.test.ts`

- [ ] **Step 1: The failing tests.** Append:

```ts
describe('Repel (forms.ts)', () => {
  it('pulses: the foes round the hero are hit, knocked back and chilled; the Defensive up ends', () => {
    const w = arena([dummy(13, 34), dummy(13, 24)], {
      noBasic: true,
      weapon: 'staff',
      defensive: { moves: [{ kind: 'medium', form: 'ward', elements: ['fire'] }, { kind: 'medium', form: 'repel', elements: ['fire'] }] },
    });
    press(w, 1);
    expect(w.hero.ward).not.toBeNull();
    run(w, bal.chains.beat.medium * bal.chains.beatSlot.defensive + 0.1);
    w.hero.cooldowns[1][1] = 0;
    const events = press(w, 1);
    const [near, far] = w.monsters;
    expect(w.hero.ward).toBeNull();
    expect(w.hero.defend).toBeNull();
    expect(hits(events, near.id)).toHaveLength(1);
    expect(damaged(far)).toBe(false);
    expect(near.kby).toBeLessThan(0);
    expect(near.status.stacks.frost).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === 'explode' && e.x === w.hero.x)).toBe(true);
  });
});
```

  (`ArenaOpts.weapon` is Task 5's; until then write `equipped: { weapon: gear('fire', 'weapon', 'staff') }` and switch it in Task 5. A Repel on a staff: it is a ranged form, and the sword's class can't express it — A's `setChains` gating is the profile's; `arena()` sets chains directly, so this test would run on a sword too, but keep it honest.)

- [ ] **Step 2: Run, expect FAIL.** Expected: **1 failed** (A's placeholder plays Repel as a Ward: the Ward stays up, nothing is hit).

- [ ] **Step 3: Implement.** In `packages/engine/src/arpg/abilities/forms.ts`, replace:

```ts
    case 'armor':
      buff('armor', ab.duration);
      return done(h.x, h.y);
```

  with:

```ts
    case 'armor':
      buff('armor', ab.duration);
      return done(h.x, h.y);

    case 'repel': {
      // A pulse (the constructs spec §2.2): the foes round the hero are hit, pushed `effect` ×
      // REPEL_PUSH and chilled (the one slow). It ends the Defensive up, as Blink does, and
      // leaves none.
      h.ward = null;
      h.defend = null;
      const reach = ab.radius * size;
      const hits = alive(ctx).filter(
        (m) => dist(h.x, h.y, m.x, m.y) - m.radius <= reach && sees(world.map, h, m),
      );
      ctx.events.push({
        kind: 'explode',
        x: h.x,
        y: h.y,
        radius: reach,
        element: ab.element,
        infusion: ab.elements[1] ?? null,
        ...lookOf(ab),
      });
      const base = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
      const applies = base.applies ?? [];
      const opts = {
        ...base,
        knockback: (base.knockback ?? 0) + ab.effect * REPEL_PUSH,
        applies: applies.includes('chill') ? applies : [...applies, 'chill' as const],
      };
      for (const m of hits) hitMonster(ctx, m, hit, ab.element, opts);
      if (hits.length > 0) chainFrom(ctx, ab, hits[0], hit, new Set(hits.map((m) => m.id)));
      return done(h.x, h.y);
    }
```

  and above `function rotate(`:

```ts
/** Repel's knockback per point of its `effect` (Earth's knob is 1: an effect of 0.5 pushes as Earth does). */
const REPEL_PUSH = 2;
```

  In `packages/engine/src/data/arpg.json`, the `repel` row's `text` (A's placeholder text, if any) reads: `"A pulse that knocks the foes around you back and chills them."` In `hero-stats.ts`'s `TARGETS`, `repel: 2.5,` after `ward: 2.5,`.

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-forms-styles.test.ts tests/ability-forms.test.ts tests/ability-data.test.ts --reporter=dot)
```

  Re-record the fingerprint.

- [ ] **Step 5: Commit** (`forms.ts`, `arpg.json`, `hero-stats.ts`, the test): `feat(engine): Repel pulses, knocking the foes around the hero back and chilling them`.

## Chunk 2: Onslaught, the melee versions, Surge, Blink

### Task 4: Onslaught and its protection

**Files:**
- Modify: `packages/engine/src/types/arpg.ts`, `packages/engine/src/types/delve.ts`, `packages/engine/src/data/schemas.ts`, `packages/engine/src/data/balance.json`, `packages/engine/src/arpg/abilities/targeting.ts`, `packages/engine/src/arpg/abilities/forms.ts`, `packages/engine/src/arpg/combat.ts`, `packages/engine/src/delve/hero-stats.ts`, `packages/engine/tests/delve-forms-styles.test.ts`

- [ ] **Step 1: The failing tests.** Append:

```ts
describe('Onslaught (forms.ts performTick, combat.ts hurtHero)', () => {
  const onslaught = { form: 'onslaught', payment: 'mana' } as const;
  const form = () => registry.getForm('onslaught');

  it('darts between the foes in the area, striking count times, never the same foe twice running', () => {
    const w = arena([dummy(13, 29), dummy(15, 28), dummy(13, 16)], {
      noBasic: true,
      ultimate: { ...onslaught },
    });
    const events = [...press(w, 2, { x: 13, y: 28 }), ...run(w, form().duration! + 0.1)];
    const [a, b, far] = w.monsters;
    expect(hits(events, a.id).length + hits(events, b.id).length).toBe(form().count);
    expect(hits(events, a.id).length).toBeGreaterThan(0);
    expect(hits(events, b.id).length).toBeGreaterThan(0);
    expect(damaged(far)).toBe(false);
    expect(events.filter((e) => e.kind === 'dash')).toHaveLength(form().count);
    expect(w.hero.perform ?? null).toBeNull();
    // It stands by its last foe.
    const gaps = w.monsters.slice(0, 2).map((m) => Math.hypot(m.x - w.hero.x, m.y - w.hero.y));
    expect(Math.min(...gaps)).toBeLessThan(2);
  });

  it('is invulnerable while darting, then takes effect less damage for onslaughtGuard seconds', () => {
    const w = arena([dummy(13, 29)], { noBasic: true, ultimate: { ...onslaught } });
    press(w, 2, { x: 13, y: 29 });
    const ctx = makeCtx(registry, w, []);
    const hp = w.hero.hp;
    hurtHero(ctx, 30, null, null);
    expect(w.hero.hp).toBe(hp);
    run(w, form().duration! + STEP);
    const guard = w.hero.onslaughtGuard!;
    expect(guard.until).toBeCloseTo(w.t + bal.abilities.defend.onslaughtGuard, 1);
    const plain = arena([dummy(13, 29)], { noBasic: true });
    hurtHero(makeCtx(registry, plain, []), 30, null, null, { unavoidable: true });
    hurtHero(ctx, 30, null, null, { unavoidable: true });
    const lost = (x: ArpgWorld) => x.hero.stats.maxHp - x.hero.hp;
    expect(lost(w)).toBeCloseTo(lost(plain) * (1 - moveOf(w, 2).effect), 6);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **2 failed** (A's placeholder plays it as a Nova).

- [ ] **Step 3: Implement.**

  In `packages/engine/src/types/arpg.ts`, after the `perform?` field (Task 2) add:

```ts
  /** Onslaught's protection after its darts: damage taken × (1 − `reduce`) until `until`. */
  onslaughtGuard?: { until: number; reduce: number };
```

  In `packages/engine/src/types/delve.ts`, in the `defend` block, replace:

```ts
    surgeMove: number;
    blinkSeconds: number;
  };
```

  with:

```ts
    surgeMove: number;
    blinkSeconds: number;
    /** Seconds Onslaught's protection lasts after its darts (the constructs spec §2.2). */
    onslaughtGuard: number;
  };
```

  (`surgeMove` goes in Task 6.) In `packages/engine/src/data/schemas.ts`, in the `defend` object, after `blinkSeconds: z.number().min(0),` add `onslaughtGuard: z.number().min(0),`. In `packages/engine/src/data/balance.json`, in `delve.abilities.defend`, after `"blinkSeconds": 2` add `, "onslaughtGuard": 2` (one key, the file's spacing kept; never reformat the file).

  In `packages/engine/src/arpg/abilities/targeting.ts`, replace:

```ts
const PLACED = new Set(['burst', 'barrage', 'maelstrom']);
```

  with:

```ts
const PLACED = new Set(['burst', 'barrage', 'maelstrom', 'onslaught']);
```

  In `packages/engine/src/arpg/abilities/forms.ts`, replace:

```ts
    case 'nova':
      impact(ctx, ab, h.x, h.y, ab.radius, hit, { noScatter: true, heft });
      return done(h.x, h.y);
```

  with:

```ts
    case 'nova':
      impact(ctx, ab, h.x, h.y, ab.radius, hit, { noScatter: true, heft });
      return done(h.x, h.y);

    case 'onslaught': {
      // The darts (the constructs spec §2.2): `count` over `duration` between the foes in the
      // area round `p` (`performTick`), the hero untouchable meanwhile, then protected
      // (`onslaughtGuard`). An Echo replays one dart.
      h.facing = dir;
      h.perform = {
        form: 'onslaught',
        ability: ab,
        hit,
        heft,
        size,
        nextAt: t,
        every: ab.duration / ab.count,
        left: ab.replay ? 1 : ab.count,
        struck: 0,
        at: p,
        lastId: null,
      };
      if (!ab.replay) h.invulnUntil = Math.max(h.invulnUntil, t + ab.duration);
      return done(p.x, p.y);
    }
```

  In `performTick`, replace:

```ts
  const ab = o.ability;
  if (o.form === 'whirl') sweep(ctx, ab, o.hit, o.heft, ab.radius * o.size, 360, h.facing, o.struck === 0);
  o.struck++;
  o.left--;
  o.nextAt += o.every;
  if (o.left <= 0) h.perform = null;
}
```

  with:

```ts
  const ab = o.ability;
  if (o.form === 'whirl') {
    sweep(ctx, ab, o.hit, o.heft, ab.radius * o.size, 360, h.facing, o.struck === 0);
  } else if (!dart(ctx, o)) {
    endOnslaught(ctx, o);
    return;
  }
  o.struck++;
  o.left--;
  o.nextAt += o.every;
  if (o.left <= 0) {
    if (o.form === 'onslaught') endOnslaught(ctx, o);
    else h.perform = null;
  }
}

type Perform = NonNullable<HeroEntity['perform']>;

/**
 * One of Onslaught's darts: to the nearest living foe within the area's
 * radius + 1 of its centre that the hero perceives, never the one struck last
 * while another stands; the hero moves to its contact gap (walls stop it),
 * faces it and strikes it once (a `dash` and a `slash` mark it; Detonate
 * blasts round it; the first dart chains). False with no foe to dart at.
 */
function dart(ctx: SimCtx, o: Perform): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const ab = o.ability;
  const near = alive(ctx)
    .filter(
      (m) =>
        dist(o.at.x, o.at.y, m.x, m.y) - m.radius <= ab.radius + 1 &&
        perceives(world.map, h, m),
    )
    .sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y));
  const m = near.find((f) => f.id !== o.lastId) ?? near[0];
  if (!m) return false;
  const from = { x: h.x, y: h.y };
  const d = dirTo(h.x, h.y, m.x, m.y);
  const gap = dist(h.x, h.y, m.x, m.y) - m.radius - h.radius - bal.feel.contactGap;
  if (gap > 0 && (d.x !== 0 || d.y !== 0))
    Object.assign(h, moveCircle(world.map, h, h.radius, d.x * gap, d.y * gap));
  if (d.x !== 0 || d.y !== 0) h.facing = d;
  const infusion = ab.elements[1] ?? null;
  ctx.events.push({
    kind: 'dash',
    fromX: from.x,
    fromY: from.y,
    toX: h.x,
    toY: h.y,
    infusion,
    ...lookOf(ab),
  });
  ctx.events.push({
    kind: 'slash',
    x: h.x,
    y: h.y,
    dir: h.facing,
    range: 1.5,
    arc: 90,
    element: ab.element,
    heft: o.heft,
    infusion,
    ...lookOf(ab),
    ...(ab.replay ? { echo: true as const } : {}),
  });
  hitMonster(ctx, m, o.hit, ab.element, hitOpts(ab, from, false, true, o.heft));
  detonate(ctx, ab, m, o.hit);
  if (o.struck === 0) chainFrom(ctx, ab, m, o.hit, new Set([m.id]));
  o.lastId = m.id;
  return true;
}

/** The darts are over: the protection follows (not an Echo's). */
function endOnslaught(ctx: SimCtx, o: Perform): void {
  const h = ctx.world.hero;
  h.perform = null;
  if (o.ability.replay) return;
  h.onslaughtGuard = {
    until: ctx.world.t + ctx.bal.abilities.defend.onslaughtGuard,
    reduce: o.ability.effect,
  };
}
```

  Add `HeroEntity` to the `../../types/arpg.js` type import. In `packages/engine/src/arpg/combat.ts`, in `hurtHero`, replace:

```ts
  // Last Stand (a boon): less damage while it runs.
  if (world.t < (h.lastStandUntil ?? 0)) dmg *= 1 - (h.boon.lastStand?.reduce ?? 0);
```

  with:

```ts
  // Last Stand (a boon): less damage while it runs.
  if (world.t < (h.lastStandUntil ?? 0)) dmg *= 1 - (h.boon.lastStand?.reduce ?? 0);
  // Onslaught's protection after its darts (the constructs spec §2.2).
  if (h.onslaughtGuard && world.t < h.onslaughtGuard.until) dmg *= 1 - h.onslaughtGuard.reduce;
```

  In `hero-stats.ts`'s `TARGETS`, `onslaught: 1,` after `maelstrom: 3,` (`repeatsOf` already counts its darts).

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-forms-styles.test.ts tests/ability-forms.test.ts tests/delve-maps-aim.test.ts tests/data-validation.test.ts --reporter=dot)
```

  (If `tests/data-validation.test.ts` is named otherwise, run the balance schema's test.) Re-record the fingerprint.

- [ ] **Step 5: Commit** (the nine files): `feat(engine): Onslaught darts between foes, untouchable, then protected`.

### Task 5: The melee Lance, Burst and Maelstrom

**Files:**
- Modify: `packages/engine/src/data/arpg.json`, `packages/engine/src/types/arpg.ts`, `packages/engine/src/arpg/abilities/forms.ts`, `packages/engine/src/arpg/step.ts`, `packages/engine/tests/fixtures/arena.ts`, `packages/engine/tests/delve-forms-styles.test.ts`, `packages/engine/tests/ability-forms.test.ts` and the sim tests listed in Step 5

- [ ] **Step 1: The fixture.** In `packages/engine/tests/fixtures/arena.ts`, in `ArenaOpts` add after `equipped?: EquippedGear;`:

```ts
  /** The weapon base the fixture's Fire weapon takes (default a sword; `equipped` wins). */
  weapon?: string;
```

  and replace:

```ts
  const equipped = opts.equipped ?? { weapon: gear('fire'), chest: gear('earth', 'chest') };
```

  with:

```ts
  const equipped = opts.equipped ?? {
    weapon: gear('fire', 'weapon', opts.weapon ?? 'sword'),
    chest: gear('earth', 'chest'),
  };
```

  Switch Task 3's Repel test to `weapon: 'staff'`.

- [ ] **Step 2: The failing tests.** Append:

```ts
describe('the melee versions (forms.ts): a Lance lunge, a Burst eruption, a Maelstrom that follows', () => {
  it('a melee Lance lunges the line, striking every foe it passes; a ranged one beams as before', () => {
    const foes = () => [dummy(13, 33), dummy(13, 31.5), dummy(13, 25), dummy(18, 31)];
    const melee = arena(foes(), { noBasic: true, primary: { form: 'lance' } });
    const events = press(melee, 0);
    expect(melee.monsters.slice(0, 2).every(damaged)).toBe(true);
    expect(damaged(melee.monsters[2])).toBe(false);
    expect(damaged(melee.monsters[3])).toBe(false);
    expect(events.some((e) => e.kind === 'dash')).toBe(true);
    expect(events.some((e) => e.kind === 'beam')).toBe(false);
    expect(36 - melee.hero.y).toBeCloseTo(registry.getForm('lance').melee!.range!, 0);
    expect(melee.hero.invulnUntil).toBeLessThanOrEqual(melee.t);
    const ranged = arena(foes(), { noBasic: true, weapon: 'staff', primary: { form: 'lance' } });
    const beam = press(ranged, 0);
    expect(ranged.monsters.slice(0, 3).every(damaged)).toBe(true);
    expect(beam.some((e) => e.kind === 'beam')).toBe(true);
    // Lance's own recoil (−0.3) is all that moves a ranged caster.
    expect(ranged.hero.y).toBeCloseTo(36, 0);
  });

  it('a melee Burst erupts at the aim point at once, within its range; a ranged one is thrown', () => {
    const melee = arena([dummy(13, 31)], { noBasic: true, primary: { form: 'burst' } });
    press(melee, 0, { x: 13, y: 31 });
    expect(damaged(melee.monsters[0])).toBe(true);
    expect(melee.zones.some((z) => z.source === 'burst')).toBe(false);
    const ranged = arena([dummy(13, 31)], {
      noBasic: true,
      weapon: 'staff',
      primary: { form: 'burst' },
    });
    press(ranged, 0, { x: 13, y: 31 });
    expect(damaged(ranged.monsters[0])).toBe(false);
    expect(ranged.zones.some((z) => z.source === 'burst')).toBe(true);
  });

  it('a melee Maelstrom rides the hero; a ranged one stays where it was placed', () => {
    const melee = arena([dummy(13, 24)], {
      noBasic: true,
      ultimate: { form: 'maelstrom', payment: 'mana' },
    });
    press(melee, 2);
    const z = melee.zones.find((q) => q.source === 'maelstrom')!;
    expect(z.follow).toBe(true);
    expect([z.x, z.y]).toEqual([melee.hero.x, melee.hero.y]);
    const events = run(melee, 3, { x: 0, y: -1 });
    expect(melee.hero.y).toBeLessThan(28);
    expect(z.y).toBeCloseTo(melee.hero.y, 3);
    expect(hits(events, melee.monsters[0].id).length).toBeGreaterThan(0);
    const ranged = arena([dummy(13, 28)], {
      noBasic: true,
      weapon: 'staff',
      ultimate: { form: 'maelstrom', payment: 'mana' },
    });
    press(ranged, 2);
    run(ranged, 1, { x: 1, y: 0 });
    expect(ranged.zones.find((q) => q.source === 'maelstrom')!.x).toBe(13);
  });
});
```

- [ ] **Step 3: Run, expect FAIL.** Expected: **3 failed** (every weapon beams, throws and places).

- [ ] **Step 4: Implement.** In `packages/engine/src/data/arpg.json`, give the three shared rows their `melee` block (the contract's `FormDef.melee`; A's schema takes it): on `lance`, after `"motion": -0.3,`:

```json
      "melee": { "range": 5, "radius": 0.8, "motion": 0, "text": "A lunge along the line, striking every foe you pass. Each later move of a chain hits harder." },
```

  on `burst`, after `"speed": 30,`:

```json
      "melee": { "range": 5, "motion": 0.3, "text": "You slam the ground and it erupts where you aim, within 5 units. Each later move of a chain is bigger." },
```

  on `maelstrom`, after `"motion": 0.2,`:

```json
      "melee": { "range": 0, "motion": 0, "text": "A storm round you that moves with you, hitting everything inside for 6 s." },
```

  In `packages/engine/src/types/arpg.ts`, in `Zone`, after `heft?: number;` add:

```ts
  /** A melee Maelstrom's: moved to the hero each tick before it ticks (the constructs spec §2.2). */
  follow?: boolean;
```

  In `packages/engine/src/arpg/abilities/forms.ts`, in `executeForm` after the `done` closure add:

```ts
  // A shared form's melee version plays on a melee weapon (the contract's `FormDef.melee`).
  const melee = h.stats.weapon.class === 'melee' && ab.form.melee !== undefined;
```

  In the `lance` case, replace:

```ts
    case 'lance': {
      h.facing = dir;
      const len = ab.range * size;
      const width = ab.radius;
      const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
```

  with:

```ts
    case 'lance': {
      h.facing = dir;
      const len = ab.range * size;
      const width = ab.radius;
      const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
      if (melee) {
        // The lunge (the constructs spec §2.2): the hero drives the line to the first wall and
        // strikes every foe within `width` of its way that either end sees, nearest first. No
        // i-frames; Multi-shot's extra beams are one lunge.
        const from = { x: h.x, y: h.y };
        const far = clipSight(world.map, h, { x: h.x + dir.x * len, y: h.y + dir.y * len });
        const k = dist(h.x, h.y, far.x, far.y);
        Object.assign(h, moveCircle(world.map, h, h.radius, dir.x * k, dir.y * k));
        const hits = alive(ctx)
          .filter(
            (m) =>
              distToSegment(m.x, m.y, from.x, from.y, h.x, h.y) <= width + m.radius &&
              (sees(world.map, from, m) || sees(world.map, h, m)),
          )
          .sort((a, b) => dist(from.x, from.y, a.x, a.y) - dist(from.x, from.y, b.x, b.y));
        ctx.events.push({
          kind: 'dash',
          fromX: from.x,
          fromY: from.y,
          toX: h.x,
          toY: h.y,
          infusion: ab.elements[1] ?? null,
          ...lookOf(ab),
        });
        const struck = new Set<number>();
        for (const m of hits) {
          struck.add(m.id);
          hitMonster(ctx, m, hit, ab.element, opts);
          detonate(ctx, ab, m, hit);
        }
        if (!ab.replay)
          for (const obj of objectsOnBeam(world, from, h, width)) hitObject(ctx, obj, 'hero');
        if (hits.length > 0) {
          chainFrom(ctx, ab, hits[hits.length - 1], hit, struck);
          leaveZone(ctx, ab, hits[0].x, hits[0].y, Math.max(1.2, width * 2), hit);
        }
        return done(h.x, h.y);
      }
```

  In the `burst` case, replace:

```ts
    case 'burst': {
      // Thrown: the mana arcs to the aim point and bursts where it lands.
      h.facing = dir;
```

  with:

```ts
    case 'burst': {
      h.facing = dir;
      if (melee) {
        // The eruption (the constructs spec §2.2): the ground erupts at the aim point at once.
        impact(ctx, ab, p.x, p.y, ab.radius * size, hit, { heft });
        return done(p.x, p.y);
      }
      // Thrown: the mana arcs to the aim point and bursts where it lands.
```

  In the `maelstrom` case, replace:

```ts
    case 'maelstrom':
      world.zones.push({
        id: world.nextId++,
        owner: 'hero',
        source: 'maelstrom',
        ability: ab,
        x: p.x,
        y: p.y,
```

  with:

```ts
    case 'maelstrom':
      // A melee weapon's rides the hero (`follow`; the constructs spec §2.2).
      world.zones.push({
        id: world.nextId++,
        owner: 'hero',
        source: 'maelstrom',
        ability: ab,
        x: melee ? h.x : p.x,
        y: melee ? h.y : p.y,
        ...(melee ? { follow: true } : {}),
```

  and its `return done(p.x, p.y);` becomes `return done(melee ? h.x : p.x, melee ? h.y : p.y);`.

  In `packages/engine/src/arpg/step.ts`, in `zonesTick`, replace:

```ts
    // Barrage impacts and thrown Bursts land once.
    if (z.detonateAt > 0) {
```

  with:

```ts
    // A melee Maelstrom rides the hero.
    if (z.follow) {
      z.x = h.x;
      z.y = h.y;
    }
    // Barrage impacts and thrown Bursts land once.
    if (z.detonateAt > 0) {
```

- [ ] **Step 5: Run, re-home the ranged expectations.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run --reporter=dot 2>&1 | tail -60)
```

  Expected: the new tests pass; about 15 tests fail whose chains put a Lance, a Burst or a Maelstrom on the fixture's sword and expect the beam, the lob or the placed zone. Each gets `weapon: 'staff'` (or, where it builds its own `equipped`, `gear('fire', 'weapon', 'staff')`); where the test is about the hero's weapon (a sword's lunge), keep it and fix the expectation. The known ones (`grep -n "form: 'lance'\|form: 'burst'\|form: 'maelstrom'" tests/*.ts`): `ability-forms.test.ts` (Lance, Burst, Maelstrom: staff), `ability-cast.test.ts` (1), `delve-combat-weight.test.ts` (about line 879 the held Maelstrom, 901 the thrown Burst's zone), `delve-maps-aim.test.ts` (39, 54, 60 the Burst's aim clamps; 105 the Lance's sight), `delve-rune-sim.test.ts` (437–470 Multi-shot's fan on a Lance; 877–886 and 1085 Drain on a Lance: the lunge strikes the same foes, so these may pass as they are), `delve-stacks.test.ts`, `delve-infusion.test.ts` (a Lance's `beam` carries the infusion: staff), `delve-room-hits.test.ts`, `delve-room-review.test.ts`, `delve-boons-combat.test.ts` (1), `delve-training.test.ts` (688, 709: the sandbox's weapon; check its base). A test that only stores the form in a moveset (`delve-movesets`, `delve-pair`, `delve-profile-abilities`, `delve-runes*`) needs nothing. Then:

```bash
(cd packages/engine && npx vitest run --reporter=dot 2>&1 | tail -8)
```

  Expected: all pass but the 2 known. Re-record the fingerprint.

- [ ] **Step 6: Commit** (`arpg.json`, `types/arpg.ts`, `forms.ts`, `step.ts`, the fixture and every test touched): `feat(engine): the melee Lance lunges, Burst erupts and Maelstrom rides the hero`.

### Task 6: Surge, one multiplier on every timer

**Files:**
- Modify: `packages/engine/src/arpg/abilities/defend.ts`, `packages/engine/src/arpg/basic.ts`, `packages/engine/src/arpg/step.ts`, `packages/engine/src/types/delve.ts`, `packages/engine/src/data/schemas.ts`, `packages/engine/src/data/balance.json`, `packages/engine/src/data/arpg.json`, `packages/engine/tests/delve-forms-styles.test.ts`

- [ ] **Step 1: The failing tests.** Add `import { surgeMult, surgeTick } from '../src/arpg/abilities/defend.js';` and append:

```ts
describe('Surge (defend.ts surgeMult, surgeTick)', () => {
  const surged = () => {
    const w = arena([dummy(13, 30)], { noBasic: true, defensive: { form: 'surge' } });
    press(w, 1);
    return w;
  };

  it('is 1 + its effect while up, 1 without', () => {
    const w = surged();
    expect(surgeMult(makeCtx(registry, w, []))).toBeCloseTo(1 + moveOf(w, 1).effect, 9);
    expect(surgeMult(makeCtx(registry, arena([], { noBasic: true }), []))).toBe(1);
  });

  it('advances the running cooldowns, beats, a wind-up and the dodge recharge, never its own cooldown', () => {
    const w = surged();
    const ctx = makeCtx(registry, w, []);
    const mult = surgeMult(ctx);
    const t = w.t;
    w.hero.cooldowns[0][0] = t + 2;
    w.hero.beatUntil[0] = t + 1;
    w.hero.comboAt[0] = t + 1;
    w.hero.dodgeRechargeAt = t + 1.6;
    const own = w.hero.cooldowns[1][0];
    surgeTick(ctx, 0.1);
    const extra = 0.1 * (mult - 1);
    expect(w.hero.cooldowns[0][0]).toBeCloseTo(t + 2 - extra, 9);
    expect(w.hero.beatUntil[0]).toBeCloseTo(t + 1 - extra, 9);
    expect(w.hero.comboAt[0]).toBeCloseTo(t + 1 - extra, 9);
    expect(w.hero.dodgeRechargeAt).toBeCloseTo(t + 1.6 - extra, 9);
    expect(w.hero.cooldowns[1][0]).toBe(own);
  });

  it('mana regen and move speed run faster', () => {
    const effect = registry.getForm('surge').effect!;
    const regen = (surge: boolean) => {
      const w = surge ? surged() : arena([dummy(13, 30)], { noBasic: true });
      w.hero.mana = 0;
      run(w, 1);
      return w.hero.mana;
    };
    expect(regen(true)).toBeCloseTo(regen(false) * (1 + effect), 1);
    const walked = (surge: boolean) => {
      const w = surge ? surged() : arena([], { noBasic: true });
      const y = w.hero.y;
      run(w, 0.5, { x: 0, y: 1 });
      return w.hero.y - y;
    };
    expect(walked(true) / walked(false)).toBeCloseTo(1 + effect, 1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **3 failed** (`surgeMult`/`surgeTick` aren't exported; the walk is × `surgeMove`).

- [ ] **Step 3: Implement.** In `packages/engine/src/arpg/abilities/defend.ts`, replace:

```ts
/** The Surge while it is up, else null. */
export function surging(ctx: SimCtx): ResolvedAbility | null {
  return ctx.world.hero.defend?.form === 'surge' ? defendingAbility(ctx) : null;
}
```

  with:

```ts
/** The Surge while it is up, else null. */
export function surging(ctx: SimCtx): ResolvedAbility | null {
  return ctx.world.hero.defend?.form === 'surge' ? defendingAbility(ctx) : null;
}

/** The Surge's multiplier on every timer the hero runs (the constructs spec §2.2): 1 + its effect; 1 without it. */
export function surgeMult(ctx: SimCtx): number {
  const surge = surging(ctx);
  return surge ? 1 + surge.effect : 1;
}

/**
 * The Surge runs every timer at `surgeMult`: each tick the running cooldowns
 * (never the Surge move's own), the beats (and the restart window counted
 * from one, while it runs), a wind-up and the dodge's recharge come forward
 * by the extra share of `dt`. Attack speed, move speed, mana regen and charge
 * gain read `surgeMult` where they are set.
 */
export function surgeTick(ctx: SimCtx, dt: number): void {
  const h = ctx.world.hero;
  const extra = dt * (surgeMult(ctx) - 1);
  if (extra <= 0) return;
  const t = ctx.world.t;
  h.chains.forEach((chain, slot) => {
    if (!chain) return;
    chain.moves.forEach((m, i) => {
      const own = slot === DEFENSIVE && m.form.id === 'surge';
      if (!own && h.cooldowns[slot][i] > t) h.cooldowns[slot][i] -= extra;
    });
    if (h.beatUntil[slot] > t) {
      h.beatUntil[slot] -= extra;
      h.comboAt[slot] -= extra;
    }
  });
  if (h.windup) {
    h.windup.until -= extra;
    h.windup.conjureUntil -= extra;
  }
  if (h.dodgeRechargeAt > 0) h.dodgeRechargeAt -= extra;
}
```

  and in `gainCharge`, replace `h.charge[i] = Math.min(chargeCap(chain), h.charge[i] + units);` with `h.charge[i] = Math.min(chargeCap(chain), h.charge[i] + units * surgeMult(ctx));`.

  In `packages/engine/src/arpg/basic.ts`, delete the `haste` function (the four lines of `function haste(ctx: SimCtx): number { … }` and the blank line after), replace `import { guardLand, surging } from './abilities/defend.js';` with `import { guardLand, surgeMult, surging } from './abilities/defend.js';`, and replace both `haste(ctx)` with `surgeMult(ctx)` (`startSwing`'s `base` and `strike`'s `cycle`).

  In `packages/engine/src/arpg/step.ts`, replace `import { defendTick, gainCharge, surging } from './abilities/defend.js';` with `import { defendTick, gainCharge, surgeMult, surgeTick } from './abilities/defend.js';`; in `heroTick`, delete the line `const surge = surging(ctx);` and replace:

```ts
    const pace =
      h.stats.moveSpeed *
      (surge ? 1 + bal.abilities.defend.surgeMove : 1) *
      quick *
```

  with:

```ts
    const pace =
      h.stats.moveSpeed *
      surgeMult(ctx) *
      quick *
```

  replace:

```ts
  h.mana = world.sandbox?.infiniteMana ? h.manaMax : Math.min(h.manaMax, h.mana + h.manaRegen * dt);
```

  with:

```ts
  h.mana = world.sandbox?.infiniteMana
    ? h.manaMax
    : Math.min(h.manaMax, h.mana + h.manaRegen * surgeMult(ctx) * dt);
```

  and replace the end of `heroTick`:

```ts
  defendTick(ctx, dt);
}
```

  with:

```ts
  surgeTick(ctx, dt);
  defendTick(ctx, dt);
}
```

  Retire `surgeMove`: delete its line from `types/delve.ts`'s `defend` block, from `schemas.ts`'s `defend` object and from `balance.json`'s `delve.abilities.defend` (keep the file's spacing). In `packages/engine/src/data/arpg.json`, the `surge` row's text becomes `"For 6 s everything you do runs 30% faster: attacks, your step, cooldowns, beats, wind-ups, mana and charge, and your dodge coming back. Basic hits also apply the element's stacks."` (`effect` 0.3 as it is). `grep -rn surgeMove packages` must find nothing but the client (a tooltip or Help, if any: add it to Needs routed 8 for C2).

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-forms-styles.test.ts tests/ability-forms.test.ts tests/delve-chains.test.ts tests/delve-dodge.test.ts tests/delve-combat-weight.test.ts tests/delve-rune-power.test.ts --reporter=dot)
```

  Re-record the fingerprint (the bot casts its Defensive: it moves).

- [ ] **Step 5: Commit** (the eight files): `feat(engine): Surge runs every timer at one multiplier`.

### Task 7: Blink lands untouchable

**Files:**
- Modify: `packages/engine/src/data/arpg.json`, `packages/engine/tests/delve-forms-styles.test.ts`

- [ ] **Step 1: The failing test.** Append:

```ts
describe('Blink (arpg.json)', () => {
  it('is untouchable through its dash and 0.5 s after landing', () => {
    const w = arena([dummy(13, 20)], { noBasic: true, defensive: { form: 'blink' } });
    press(w, 1, { x: 13, y: 20 });
    expect(w.hero.invulnUntil - w.t).toBeGreaterThanOrEqual(0.9 - STEP);
    expect(registry.getForm('blink').effect).toBe(0.9);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **1 failed** (0.4).

- [ ] **Step 3: Implement.** The engine's Blink lands on the cast tick, so the landing's 0.5 s is its untouchable seconds grown: in `packages/engine/src/data/arpg.json`, the `blink` row's `"effect": 0.4` becomes `"effect": 0.9` and its text `"Dash 5 units, untouchable through the dash and for a moment after you land, leaving a trail that hits foes."`.

- [ ] **Step 4: Run, expect PASS.** `(cd packages/engine && npx vitest run tests/delve-forms-styles.test.ts tests/ability-forms.test.ts tests/delve-chains.test.ts --reporter=dot)`. Re-record the fingerprint.

- [ ] **Step 5: Commit** (`arpg.json`, the test): `feat(engine): Blink stays untouchable for a moment after landing`.

## Chunk 3: The cast styles, the Lab view, the gate

### Task 8: The styles' numbers, looks and text

**Files:**
- Modify: `packages/engine/src/data/delve.json`, `packages/engine/src/types/arpg.ts`, `packages/engine/src/data/schemas.ts`, `packages/engine/src/arpg/abilities/resolve.ts`, `packages/engine/tests/delve-forms-styles.test.ts`

- [ ] **Step 1: The failing tests.** Add `import { resolveAbility } from '../src/arpg/abilities/resolve.js';` and `import { computeHeroStats } from '../src/delve/hero-stats.js';`, and append:

```ts
/** A move resolved on a plain Fire weapon of `baseId`. */
function on(baseId: string, move: { kind: 'medium'; form: 'bolt' | 'strike' | 'nova'; elements: ['fire'] }) {
  const stats = computeHeroStats({ weapon: gear('fire', 'weapon', baseId) }, registry, {
    pair: { primary: 'fire', secondary: null },
  });
  const slot = registry.getForm(move.form).slot;
  return resolveAbility(registry, slot, move, 'mana', stats);
}
const BOLT = { kind: 'medium', form: 'bolt', elements: ['fire'] } as const;
const STRIKE = { kind: 'medium', form: 'strike', elements: ['fire'] } as const;

describe('the cast styles (delve.json, resolve.ts)', () => {
  it("a dagger's Bolt is quicker, cheaper to wait for, weaker and shorter than a staff's; a bow's flies further and faster", () => {
    const [dagger, staff, bow] = ['dagger', 'staff', 'bow'].map((b) => on(b, BOLT));
    const numbers = registry.getGearBase('dagger').style!.numbers;
    expect(dagger.conjure / staff.conjure).toBeCloseTo(numbers.windup / registry.getGearBase('staff').style!.numbers.windup, 9);
    expect(dagger.cooldown / staff.cooldown).toBeCloseTo(numbers.cooldown, 9);
    expect(dagger.power / staff.power).toBeCloseTo(numbers.power, 9);
    expect(dagger.range / staff.range).toBeCloseTo(numbers.range, 9);
    expect(bow.range).toBeGreaterThan(staff.range);
    expect(bow.speed).toBeGreaterThan(staff.speed);
    expect(dagger.look).toBe('blade');
    expect(bow.look).toBe('arrow');
  });

  it("an axe's Strike sweeps a wider arc and radius; a maul's lands harder, later", () => {
    const [sword, axe, maul] = ['sword', 'axe', 'maul'].map((b) => on(b, STRIKE));
    expect(axe.arc).toBeCloseTo(Math.min(360, sword.arc * 1.2), 9);
    expect(axe.radius / sword.radius).toBeCloseTo(1.2, 9);
    expect(maul.power / sword.power).toBeCloseTo(1.25, 9);
    expect(maul.conjure / sword.conjure).toBeCloseTo(1.3, 9);
    expect(maul.knobs.applies).toContain('stagger');
  });

  it('every weapon base names its trait for the item header', () => {
    for (const base of registry.getGearBasesForSlot('weapon')) expect(base.style!.text.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **3 failed** (A's rows are all 1 and `{}`; no `text`).

- [ ] **Step 3: Implement.** A adds `CastStyle.text` and its schema line (the overview's Integrator notes). Only if `grep -n "text" packages/engine/src/types/arpg.ts` shows no `text` on `CastStyle`: in `packages/engine/src/types/arpg.ts`, in `CastStyle`, after `look: StyleLook;` add:

```ts
  /** The trait as the player reads it, for the item header ("Casts gain 15% crit chance"). */
  text: string;
```

  and in `packages/engine/src/data/schemas.ts`, in the style schema (the weapon base's `style` object), add `text: z.string().min(1),`.

  In `packages/engine/src/data/delve.json`, replace each weapon base's `style` row (A's, all 1, `'none'`, `{}`) with its own (the spec's §4.1 table; the file's spacing kept):

```json
      "style": { "name": "Quick", "numbers": { "windup": 0.75, "cooldown": 0.9, "power": 0.9, "range": 0.8, "radius": 0.85, "speed": 1, "duration": 1 }, "motion": "dart", "trait": { "critBonus": 0.15 }, "look": "blade", "text": "Casts gain 15% crit chance" },
```

  (dagger);

```json
      "style": { "name": "Balanced", "numbers": { "windup": 1, "cooldown": 1, "power": 1, "range": 1, "radius": 1, "speed": 1, "duration": 1 }, "motion": "step", "trait": {}, "look": "crescent", "text": "Each chain step hits 5% harder" },
```

  (sword; its `stepBonus` trait comes with Task 10's knob);

```json
      "style": { "name": "Sweeping", "numbers": { "windup": 1.1, "cooldown": 1, "power": 0.9, "range": 1, "radius": 1.2, "speed": 1, "duration": 1 }, "motion": "wade", "trait": { "cleave": 1.2 }, "look": "hatchet", "text": "Single hits cleave the foes behind" },
```

  (axe; `cleave` acts from Task 10);

```json
      "style": { "name": "Heavy", "numbers": { "windup": 1.3, "cooldown": 1.15, "power": 1.25, "range": 1, "radius": 1.15, "speed": 0.8, "duration": 1 }, "motion": "plant", "trait": { "applies": ["stagger"] }, "look": "stone", "text": "Casts stagger" },
```

  (maul);

```json
      "style": { "name": "Channeled", "numbers": { "windup": 1.1, "cooldown": 1, "power": 1, "range": 1, "radius": 1.15, "speed": 0.9, "duration": 1.2 }, "motion": "sway", "trait": { "zone": { "seconds": 1, "tickPower": 0.1, "perCast": 3 } }, "look": "orb", "text": "Impacts leave a brief zone" },
```

  (staff);

```json
      "style": { "name": "Seeking", "numbers": { "windup": 0.8, "cooldown": 1, "power": 0.85, "range": 0.9, "radius": 1, "speed": 1.3, "duration": 1 }, "motion": "orbit", "trait": { "homing": 2 }, "look": "spark", "text": "Shots seek foes" },
```

  (wand; `homing` acts from Task 10);

```json
      "style": { "name": "Marksman", "numbers": { "windup": 1.1, "cooldown": 1, "power": 1, "range": 1.25, "radius": 0.85, "speed": 1.4, "duration": 1 }, "motion": "back", "trait": { "pierce": 1 }, "look": "arrow", "text": "Shots pierce one foe" },
```

  (bow).

  In `packages/engine/src/arpg/abilities/resolve.ts`, the wind-up, cooldown and arc factors (A's `applyStyle` scales the `FormDef` fields `power`, `range`, `radius`, `speed` and `duration` and leaves `arc` alone; a `FormDef` holds no wind-up or cooldown; `tick` stays unscaled on purpose, so a staff's longer Maelstrom ticks more times): after A's `const base = applyStyle(form, stats.weapon.class, style);` add `const sn = style?.numbers;`. Replace:

```ts
  const conjure = F.conjure[wi] * F.conjureSlot[slot] * q.windup;
  const channel = cast ? s.castTime * (1 + W.castTime * w) * q.windup * (1 + load * C.cast) : 0;
```

  with:

```ts
  // The style's wind-up factor rides both parts (the constructs spec §4.2).
  const sw = sn?.windup ?? 1;
  const conjure = F.conjure[wi] * F.conjureSlot[slot] * q.windup * sw;
  const channel = cast
    ? s.castTime * (1 + W.castTime * w) * q.windup * sw * (1 + load * C.cast)
    : 0;
```

  Replace:

```ts
        : s.cooldown * (1 + W.cooldown * w) * stats.cooldownMult) * q.cooldown,
```

  with:

```ts
        : s.cooldown * (1 + W.cooldown * w) * stats.cooldownMult * (sn?.cooldown ?? 1)) *
      q.cooldown,
```

  and replace `    arc: base.arc ?? 360,` (A's; `form.arc ?? 360` before A) with:

```ts
    // The style's radius factor widens a melee arc too (the axe's "radius and arc"), to a full circle.
    arc: base.arc !== undefined ? Math.min(360, base.arc * (sn?.radius ?? 1)) : 360,
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-forms-styles.test.ts tests/ability-resolve.test.ts tests/ability-forms.test.ts tests/delve-chains.test.ts tests/delve-rune-costs.test.ts tests/delve-runes-contract.test.ts --reporter=dot)
```

  Expected: all pass (the sword stays the baseline: A's `applyStyle` identity test holds; the rune tests run on a sword). Re-record the fingerprint (the bot's drops hold other weapons: it moves).

- [ ] **Step 5: Commit** (the five files): `feat(engine): the seven cast styles' numbers, looks and trait text`.

### Task 9: Style motion

**Files:**
- Modify: `packages/engine/src/data/balance.json`, `packages/engine/src/types/delve.ts`, `packages/engine/src/data/schemas.ts`, `packages/engine/src/arpg/action.ts`, `packages/engine/src/arpg/abilities/cast.ts`, `packages/engine/tests/delve-forms-styles.test.ts`

- [ ] **Step 1: The failing tests.** Append:

```ts
describe('style motion (action.ts styleMotion)', () => {
  /** Where the hero stands as its Bolt lands, and `stepSeconds` later, aimed up at a far foe. */
  const path = (weapon: string) => {
    const w = arena([dummy(13, 26)], { noBasic: true, weapon, primary: { ...BOLT } });
    press(w, 0, { x: 13, y: 26 });
    const landed = { x: w.hero.x, y: w.hero.y };
    run(w, bal.feel.stepSeconds + STEP);
    return { landed, after: { x: w.hero.x, y: w.hero.y } };
  };

  it("a dagger darts toward the aim as it winds up; a bow steps back on release; a staff sways aside; a wand circles", () => {
    const dagger = path('dagger');
    // The dart lands before the move does; Bolt's own recoil follows it.
    expect(36 - dagger.landed.y).toBeGreaterThan(bal.feel.styleMove.dart * 0.5);
    const bow = path('bow');
    expect(bow.after.y - bow.landed.y).toBeGreaterThan(bal.feel.styleMove.back * 0.5);
    const staff = path('staff');
    expect(Math.abs(staff.after.x - 13)).toBeGreaterThan(bal.feel.styleMove.sway * 0.5);
    const wand = path('wand');
    expect(Math.abs(wand.after.x - 13)).toBeGreaterThan(bal.feel.styleMove.orbit * 0.5);
  });

  it('a sword steps in on release; a self-centred form moves nothing', () => {
    const sword = path('sword');
    expect(sword.landed.y - sword.after.y).toBeGreaterThan(bal.feel.styleMove.step * 0.5);
    const w = arena([dummy(13, 30)], { noBasic: true, weapon: 'dagger', ultimate: { payment: 'mana' } });
    press(w, 2);
    run(w, bal.feel.stepSeconds + STEP);
    expect([w.hero.x, w.hero.y]).toEqual([13, 36]);
  });
});
```

  (The bow's step back is read over `stepSeconds` after landing, beside Bolt's own recoil.)

- [ ] **Step 2: Run, expect FAIL.** Expected: **2 failed** (`styleMove` is undefined; nothing moves but Bolt's recoil).

- [ ] **Step 3: Implement.** In `packages/engine/src/data/balance.json`, in `delve.feel` after `"lobBase": 0.12` add (the file's spacing kept):

```json
    , "styleMove": { "none": 0, "dart": 0.8, "step": 0.5, "wade": 0.6, "plant": 0.7, "sway": 0.6, "orbit": 0.6, "back": 0.6 }
```

  In `packages/engine/src/types/delve.ts`, in `FeelBalance`, replace:

```ts
  /** A thrown Burst's minimum flight in seconds. */
  lobBase: number;
}
```

  with:

```ts
  /** A thrown Burst's minimum flight in seconds. */
  lobBase: number;
  /** Units a cast style's motion moves the hero (the constructs spec §4.2), by motion. */
  styleMove: Record<StyleMotion, number>;
}
```

  (import `StyleMotion` from `./arpg.js` if the file doesn't already). In `packages/engine/src/data/schemas.ts`, in the `feel` object after `lobBase: z.number().min(0),` add:

```ts
    styleMove: z.object({
      none: z.number().min(0),
      dart: z.number().min(0),
      step: z.number().min(0),
      wade: z.number().min(0),
      plant: z.number().min(0),
      sway: z.number().min(0),
      orbit: z.number().min(0),
      back: z.number().min(0),
    }),
```

  In `packages/engine/src/arpg/action.ts`, replace the type import line:

```ts
import type { ArpgWorld, HeroEntity, Push, PushKind, Vec } from '../types/arpg.js';
```

  with:

```ts
import type { ArpgWorld, HeroEntity, Push, PushKind, StyleMotion, Vec } from '../types/arpg.js';
```

  and insert after `endPushes`:

```ts
/**
 * A cast style's motion (the constructs spec §4.2): a push of
 * `feel.styleMove[motion]` units beside the form's own motion. At the press
 * (`'press'`, over `seconds` of conjure) `dart` and `wade` step in toward the
 * aim, a `stepIn` finished before the move lands and stopped at `stopId`'s
 * contact gap; at the release (`'release'`, over `seconds`) `step` and `plant`
 * step in, `back` steps back, and `sway` and `orbit` step square to the aim on
 * the side the blows' `swaySide` takes (`sway` flips it first, `orbit` keeps
 * it), each a `step`. A zero `dir` (a self-centred form) moves nothing.
 */
export function styleMotion(
  ctx: SimCtx,
  motion: StyleMotion,
  dir: Vec,
  phase: 'press' | 'release',
  seconds: number,
  stopId: number | null = null,
): void {
  const h = ctx.world.hero;
  const units = ctx.bal.feel.styleMove[motion];
  if (units <= 0 || (dir.x === 0 && dir.y === 0)) return;
  switch (motion) {
    case 'dart':
    case 'wade':
      if (phase === 'press') startPush(ctx, 'stepIn', dir, units, seconds, stopId);
      return;
    case 'step':
    case 'plant':
      if (phase === 'release') startPush(ctx, 'step', dir, units, seconds);
      return;
    case 'back':
      if (phase === 'release') startPush(ctx, 'step', { x: -dir.x, y: -dir.y }, units, seconds);
      return;
    case 'sway':
    case 'orbit':
      if (phase !== 'release') return;
      if (motion === 'sway') h.swaySide = -h.swaySide;
      startPush(ctx, 'step', { x: -dir.y * h.swaySide, y: dir.x * h.swaySide }, units, seconds);
      return;
    case 'none':
      return;
  }
}
```

  In `packages/engine/src/arpg/abilities/cast.ts`, replace `import { cancelSwing, finishPushes, startPush, swingStrikes } from '../action.js';` with `import { cancelSwing, finishPushes, startPush, styleMotion, swingStrikes } from '../action.js';`. In `fire`, replace:

```ts
  if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;
```

  with:

```ts
  // The style's release motion, beside the recoil (the constructs spec §4.2).
  const style = h.stats.weapon.style;
  if (style) {
    const d = dirTo(h.x, h.y, res.tx, res.ty);
    styleMotion(ctx, style.motion, d, 'release', bal.feel.stepSeconds);
  }
  if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;
```

  In `castAbility`, replace:

```ts
  if (ab.motion > 0 && (dir.x !== 0 || dir.y !== 0)) {
    const stop = nearestMonster(ctx, at.x, at.y, 1.5);
    // Never past the aim point, where the form would re-aim from and turn round.
    const reach = Math.min(
      ab.motion * stepBonus(bal, ab.index, h.boon.stepBonus).size,
      dist(h.x, h.y, at.x, at.y),
    );
    startPush(ctx, 'stepIn', dir, reach, ab.conjure, stop?.id ?? null);
  }
```

  with:

```ts
  const stop = dir.x !== 0 || dir.y !== 0 ? nearestMonster(ctx, at.x, at.y, 1.5) : null;
  if (ab.motion > 0 && (dir.x !== 0 || dir.y !== 0)) {
    // Never past the aim point, where the form would re-aim from and turn round.
    const reach = Math.min(
      ab.motion * stepBonus(bal, ab.index, h.boon.stepBonus).size,
      dist(h.x, h.y, at.x, at.y),
    );
    startPush(ctx, 'stepIn', dir, reach, ab.conjure, stop?.id ?? null);
  }
  // The style's press motion, beside the step-in (the constructs spec §4.2).
  const style = h.stats.weapon.style;
  if (style) styleMotion(ctx, style.motion, dir, 'press', ab.conjure, stop?.id ?? null);
```

  (A hold's release fires through `fire` too, so it gets the release motion; its press motion is none: a hold charges in place.)

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-forms-styles.test.ts tests/delve-combat-weight.test.ts tests/delve-weapon-flow.test.ts tests/ability-cast.test.ts tests/delve-dps-sim.test.ts --reporter=dot)
```

  (If `delve-weapon-flow.test.ts` is named otherwise, run the weapon flow's test.) Expected: all pass; a DPS-sim test that pins a sword hero's position may need its tolerance read against the sword's `step` (0.5 forward on release, stopped at contact by the pushes' hold-position rule). Re-record the fingerprint.

- [ ] **Step 5: Commit** (the six files): `feat(engine): each cast style moves the hero its own way on a cast`.

### Task 10: The traits: crit, cleave, homing, the step bonus

**Files:**
- Modify: `packages/engine/src/types/ability.ts`, `packages/engine/src/data/schemas.ts`, `packages/engine/src/arpg/abilities/resolve.ts`, `packages/engine/src/arpg/abilities/impact.ts`, `packages/engine/src/arpg/abilities/forms.ts`, `packages/engine/src/arpg/abilities/cast.ts`, `packages/engine/src/arpg/combat.ts`, `packages/engine/src/arpg/step.ts`, `packages/engine/src/data/delve.json`, `packages/engine/src/delve/hero-stats.ts`, `packages/engine/tests/delve-forms-styles.test.ts`

- [ ] **Step 1: The failing tests.** Add `hitMonster` to the `combat.js` import, `import { hitOpts, cleaveBehind } from '../src/arpg/abilities/impact.js';`, `import { moveNumbers, NEUTRAL, mergeKnobs, resolveChain, stepBonus } from '../src/arpg/abilities/resolve.js';` (merging with the earlier import), and append:

```ts
describe('the traits (impact.ts, combat.ts, step.ts, resolve.ts)', () => {
  it("critBonus: a dagger's hits roll crit with its bonus; a bonus of 1 always crits", () => {
    const dagger = on('dagger', STRIKE);
    expect(hitOpts(dagger, { x: 0, y: 0 }).critBonus).toBeCloseTo(0.15, 9);
    const w = arena([dummy(13, 30)], { noBasic: true });
    w.hero.stats = { ...w.hero.stats, critChance: 0 };
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    hitMonster(ctx, w.monsters[0], 10, 'fire', { source: 'skill', canCrit: true, critBonus: 1 });
    expect(hits(events, w.monsters[0].id)[0].crit).toBe(true);
  });

  it('cleave: a single-target hit on an axe cleaves the foes just behind its foe for half', () => {
    const w = arena([dummy(13, 30), dummy(13, 29), dummy(13, 26)], { noBasic: true, weapon: 'axe' });
    w.hero.stats = { ...w.hero.stats, critChance: 0 };
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    const ab = moveOf(w, 0);
    expect(ab.knobs.cleave).toBeGreaterThan(0);
    hitMonster(ctx, w.monsters[0], 10, 'fire', { source: 'skill', crit: false, stacks: 0 });
    const full = hits(events, w.monsters[0].id)[0].amount;
    cleaveBehind(ctx, ab, w.monsters[0], 10);
    // Half the hit, read as a ratio to the same hit on the struck foe (resists and stacks alike).
    expect(hits(events, w.monsters[1].id)[0].amount / full).toBeCloseTo(0.5, 2);
    expect(damaged(w.monsters[2])).toBe(false);
    expect(hits(events, w.monsters[0].id)).toHaveLength(1);
  });

  it("homing: a wand's Bolt aimed a little beside a foe turns into it; a staff's misses", () => {
    const flies = (weapon: string) => {
      const w = arena([dummy(13, 28)], { noBasic: true, weapon, primary: { ...BOLT } });
      press(w, 0, { x: 14.6, y: 20 });
      run(w, 1.5);
      return damaged(w.monsters[0]);
    };
    expect(flies('wand')).toBe(true);
    expect(flies('staff')).toBe(false);
  });

  it("stepBonus: a sword's chain steps 5% harder; the knob merges by adding; the Anvil's numbers see it", () => {
    expect(mergeKnobs({ stepBonus: 0.05 }, { stepBonus: 0.02 }).stepBonus).toBeCloseTo(0.07, 12);
    expect(NEUTRAL.stepBonus).toBe(0);
    expect(on('sword', STRIKE).knobs.stepBonus).toBeCloseTo(0.05, 9);
    const stats = computeHeroStats({ weapon: gear('fire') }, registry, { pair: { primary: 'fire', secondary: null } });
    const chain = resolveChain(registry, stats, 'primary', { moves: [STRIKE, STRIKE], payment: 'mana' });
    const second = chain.moves[1];
    expect(moveNumbers(stats, bal, second).hit).toBeCloseTo(
      stats.weaponDamage * stats.damageMult * second.power * stepBonus(bal, 1, 0.05).power,
      6,
    );
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Expected: **4 failed** (`critBonus` isn't carried; `cleaveBehind` isn't exported; the wand's shot flies straight; `stepBonus` isn't a knob).

- [ ] **Step 3: Implement.**

  **The `stepBonus` knob.** A adds it beside the other three (Needs routed 3). Only where `grep -n stepBonus packages/engine/src/types/ability.ts` finds nothing: in `packages/engine/src/types/ability.ts`, in `Knobs`, after A's `homing: number;` add:

```ts
  /** A cast style's trait: added to `chains.stepBonus` per chain step (the sword's; 0: none). */
  stepBonus: number;
```

  likewise `stepBonus: z.number().min(0),` in `KnobsSchema` (`schemas.ts`), `stepBonus: 0,` in `NEUTRAL` and `k.stepBonus += p.stepBonus ?? 0;` in `mergeKnobs` (`resolve.ts`), each only where missing. Then, always, in `resolve.ts`'s `moveNumbers` replace `const step = stepBonus(bal, ab.index);` with `const step = stepBonus(bal, ab.index, ab.knobs.stepBonus);`. In `packages/engine/src/arpg/abilities/forms.ts`, replace `const { power, size } = stepBonus(ctx.bal, ab.index, h.boon.stepBonus);` with `const { power, size } = stepBonus(ctx.bal, ab.index, h.boon.stepBonus + ab.knobs.stepBonus);`. In `packages/engine/src/arpg/abilities/cast.ts`, replace both `stepBonus(bal, ab.index, h.boon.stepBonus)` with `stepBonus(bal, ab.index, h.boon.stepBonus + ab.knobs.stepBonus)` (the recoil's `size` in `fire` and the step-in's `reach` in `castAbility`). In `packages/engine/src/data/delve.json`, the sword's `"trait": {}` becomes `"trait": { "stepBonus": 0.05 }`.

  **critBonus.** In `packages/engine/src/arpg/combat.ts`, in `HitOpts` after `crit?: boolean;` add:

```ts
  /** Added to the crit chance of this roll (a cast style's trait, the dagger's; see the constructs spec §4.2). */
  critBonus?: number;
```

  and in `hitMonster` replace:

```ts
  if (opts.crit === undefined && opts.canCrit) crit = world.rng.next() < stats.critChance;
```

  with:

```ts
  if (opts.crit === undefined && opts.canCrit)
    crit = world.rng.next() < stats.critChance + (opts.critBonus ?? 0);
```

  In `packages/engine/src/arpg/abilities/impact.ts`, in `hitOpts`, after `canCrit: !tick,` add `critBonus: k.critBonus,`.

  **cleave.** In `impact.ts`, after `detonate` add:

```ts
/**
 * The axe's cleave (the constructs spec §4.2): a hit that struck one foe, `m`,
 * alone cleaves the foes within `knobs.cleave` of it and beyond it from the
 * hero, each for half the hit, non-direct. Nothing without the knob.
 */
export function cleaveBehind(ctx: SimCtx, ab: ResolvedAbility, m: MonsterEntity, damage: number): void {
  const c = ab.knobs.cleave;
  if (c <= 0) return;
  const { world } = ctx;
  const h = world.hero;
  const way = dirTo(h.x, h.y, m.x, m.y);
  const opts = hitOpts(ab, { x: m.x, y: m.y }, false, false, 0);
  for (const o of alive(ctx)) {
    if (o === m || dist(m.x, m.y, o.x, o.y) > c + o.radius) continue;
    if ((o.x - m.x) * way.x + (o.y - m.y) * way.y <= 0 || !sees(world.map, m, o)) continue;
    hitMonster(ctx, o, damage * 0.5, ab.element, opts);
  }
}
```

  In `impact()`, after the Detonate line (Task 1) add:

```ts
  // The axe's cleave: an impact that struck one foe alone cleaves the foes behind it.
  if (!o.tick && !o.through && hits.length === 1) cleaveBehind(ctx, ab, hits[0], damage);
```

  In `forms.ts`, add `cleaveBehind` to the `./impact.js` import and in `dart` after `detonate(ctx, ab, m, o.hit);` add `cleaveBehind(ctx, ab, m, o.hit);`.

  **homing.** In `packages/engine/src/arpg/step.ts`, after `steer` add:

```ts
/**
 * The wand's homing (the constructs spec §4.2): an ability's shot turns toward
 * the nearest foe within 6 it perceives and hasn't hit, by at most `rate`
 * radians a second. A Volley dart has its own steering; a shard and an ember none.
 */
function homingTick(ctx: SimCtx, p: Projectile, rate: number, dt: number): void {
  const target = nearestMonster(ctx, p.x, p.y, 6, new Set(p.hitIds), p.radius);
  if (!target) return;
  const speed = Math.hypot(p.vx, p.vy);
  if (speed <= 0) return;
  const want = dirTo(p.x, p.y, target.x, target.y);
  const dx = p.vx / speed;
  const dy = p.vy / speed;
  const a = Math.max(-rate * dt, Math.min(rate * dt, Math.atan2(dx * want.y - dy * want.x, dx * want.x + dy * want.y)));
  const c = Math.cos(a);
  const s = Math.sin(a);
  p.vx = (dx * c - dy * s) * speed;
  p.vy = (dx * s + dy * c) * speed;
}
```

  and in `projectilesTick` replace `if (p.homingId !== null) steer(ctx, p, dt);` with:

```ts
    if (p.homingId !== null) steer(ctx, p, dt);
    else if (p.ability && p.ability.knobs.homing > 0 && p.form !== 'shard' && p.form !== 'ember')
      homingTick(ctx, p, p.ability.knobs.homing, dt);
```

  **Power.** In `packages/engine/src/delve/hero-stats.ts`, after `const PER_STACK = 0.05;` add:

```ts
/** A cleave is worth a quarter of a hit, a homing shot finds its foe a tenth more often. */
const CLEAVE = 0.25;
const HOMING = 0.1;
```

  In `reach`, replace the `return` (Task 1's) with:

```ts
  const cleave = k.cleave > 0 ? CLEAVE : 0;
  return targets + pierced + jumps + zone + shards + blasts + cleave;
```

  and in `damagePerUse` replace:

```ts
      const targets = TARGETS[ab.form.id] * (1 + (k.area - 1) * 0.5);
      const step = stepBonus(bal, ab.index).power;
      const perHit = hit * ab.power * step * (1 + stats.elementPower[ab.element]);
```

  with:

```ts
      const targets =
        TARGETS[ab.form.id] * (1 + (k.area - 1) * 0.5) * (k.homing > 0 ? 1 + HOMING : 1);
      const step = stepBonus(bal, ab.index, k.stepBonus).power;
      // The dagger's crit bonus is worth its share of the crit multiplier's extra.
      const perHit =
        hit *
        ab.power *
        step *
        (1 + stats.elementPower[ab.element]) *
        (1 + k.critBonus * (stats.critMultiplier - 1));
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-forms-styles.test.ts tests/ability-resolve.test.ts tests/delve-runes-contract.test.ts tests/delve-rune-power.test.ts tests/delve-rune-sim.test.ts tests/delve-chains.test.ts --reporter=dot)
```

  Expected: all pass (a contract test that lists `NEUTRAL`'s keys gains `stepBonus`). Re-record the fingerprint.

- [ ] **Step 5: Commit** (the eleven files): `feat(engine): the styles' traits: the dagger's crit, the axe's cleave, the wand's homing, the sword's step bonus`.

### Task 11: The Lab's `'style'` view and the reference weapons

**Files:**
- Modify: `packages/engine/src/arpg/dps-sim.ts`, `packages/engine/src/index.ts`, `packages/engine/tests/delve-dps-sim.test.ts`, `packages/engine/tests/delve-rune-costs-gate.test.ts`, `packages/client/src/pages/DelveLab.tsx`

- [ ] **Step 1: The failing tests.** In `packages/engine/tests/delve-dps-sim.test.ts`, add `referenceWeapons` to the `dps-sim.js` import and append a `describe`:

```ts
describe('the style view and the reference weapons (the constructs spec §4.4)', () => {
  it('each form is measured on its reference weapon: the sword for melee, the staff for ranged, both for shared', () => {
    expect(referenceWeapons(registry, 'strike')).toEqual(['sword']);
    expect(referenceWeapons(registry, 'bolt')).toEqual(['staff']);
    expect(referenceWeapons(registry, 'lance')).toEqual(['sword', 'staff']);
    const abilities = grid.filter((s) => s.view === 'ability');
    expect(new Set(abilities.filter((s) => s.dims.form === 'lance').map((s) => s.dims.weapon))).toEqual(new Set(['sword', 'staff']));
    expect(abilities.filter((s) => s.dims.form === 'bolt').every((s) => s.weapon.baseId === 'staff')).toBe(true);
    const runes = grid.filter((s) => s.view === 'rune' && s.dims.on === 'burst' && s.dims.rune === 'none');
    expect(runes.map((s) => s.dims.weapon).sort()).toEqual(['sword', 'sword', 'staff', 'staff']);
  });

  it("the style view holds every weapon × attack form its class allows, Fire, the form's default chain", () => {
    const styles = grid.filter((s) => s.view === 'style');
    expect(styles).toHaveLength(49);
    expect(styles.every((s) => Object.keys(s.dims).join() === 'form,weapon')).toBe(true);
    expect(styles.some((s) => s.dims.weapon === 'bow' && s.dims.form === 'strike')).toBe(false);
    const row = styles.find((s) => s.dims.weapon === 'maul' && s.dims.form === 'lance')!;
    expect(row.chains.primary.moves.map((m) => m.kind)).toEqual(registry.getForm('lance').defaultChain);
    expect(row.chains.primary.moves.every((m) => m.elements.join() === 'fire')).toBe(true);
    expect(row.hold).toEqual({ slot: 0 });
    // Averaged over RUNE_SEEDS, as a rune row is: one combat fork a seed.
    const spy = vi.spyOn(SeededRNG.prototype, 'fork');
    simulateDps(registry, row, { depth: 10, pack: false });
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(RUNE_SEEDS);
    spy.mockRestore();
  });
});
```

  (`SeededRNG` is imported in that file already, or add `import { SeededRNG } from '../src/rng/seeded-rng.js';`. The ability-view counts in its "grid" test change: 14 form × reference-weapon pairs (strike, whirl, onslaught, bolt, volley, barrage on one; lance, burst, nova, maelstrom on two) × 36 sets × 4 kinds × 3 payments = **6048** rows with a kind and **1512** defaults; update the two `toHaveLength` lines and the rune view's `none` count to 2 × (14 + 7) = **42**; read the socketed count off the run once and pin it, with its arithmetic in a comment.)

- [ ] **Step 2: Run, expect FAIL.** Expected: the new `describe`'s 2 tests fail (`referenceWeapons` isn't exported; no style rows), and the grid test's counts.

- [ ] **Step 3: Implement.** In `packages/engine/src/arpg/dps-sim.ts`:

  Replace `view: 'basic' | 'ability' | 'rune';` with `view: 'basic' | 'ability' | 'rune' | 'style';` and its doc gains `{ form, weapon } (the style view: a weapon and an attack form its class allows)`. Replace `import { defaultBasic, defaultChains } from './abilities/resolve.js';` with the same plus `import { defaultForm, formAllowed, weaponClass } from '../loot/moveset.js';` (A's names). Replace in `simulateDps`:

```ts
  if (setup.view !== 'rune' || o.seed !== undefined) return runDps(registry, setup, o);
```

  with:

```ts
  const averaged = setup.view === 'rune' || setup.view === 'style';
  if (!averaged || o.seed !== undefined) return runDps(registry, setup, o);
```

  Insert before `dpsCombos`:

```ts
/**
 * The weapons a form is measured on in the ability and rune views (the
 * constructs spec §4.4): the sword for a melee form, the staff for a ranged
 * one, both for a shared one, each playing the form its own class's way.
 */
export function referenceWeapons(registry: DataRegistry, form: FormId): string[] {
  const cls = registry.getForm(form).class;
  return cls === 'melee' ? ['sword'] : cls === 'ranged' ? ['staff'] : ['sword', 'staff'];
}
```

  (import `FormId` from `../types/ability.js`.) In `dpsCombos`, replace the ability loop:

```ts
  for (const form of registry.getArpgData().forms) {
    if (form.slot === 'defensive') continue;
    for (const elements of sets)
      for (const kind of [...MOVE_KINDS, 'default' as const])
        for (const payment of ABILITY_PAYMENTS) {
          const [first, second = null] = elements;
          const kinds: MoveKind[] = kind === 'default' ? form.defaultChain : [kind];
          out.push({
            view: 'ability',
            dims: { form: form.id, first, second: second ?? 'none', kind, payment },
            weapon: { baseId: 'sword', primary: first, secondary: second },
            chains: {
              ...defaultChains(registry, first, 'sword'),
              basic: defaultBasic(registry, 'sword', first, second),
              [form.slot]: {
                moves: kinds.map((k) => ({ kind: k, form: form.id, elements })),
                payment,
              },
            },
            hold: { slot: ABILITY_SLOTS.indexOf(form.slot) },
          });
        }
  }
  out.push(...runeRows(registry));
  return out;
}
```

  with:

```ts
  for (const form of registry.getArpgData().forms) {
    if (form.slot === 'defensive') continue;
    for (const weapon of referenceWeapons(registry, form.id))
      for (const elements of sets)
        for (const kind of [...MOVE_KINDS, 'default' as const])
          for (const payment of ABILITY_PAYMENTS) {
            const [first, second = null] = elements;
            const kinds: MoveKind[] = kind === 'default' ? form.defaultChain : [kind];
            out.push({
              view: 'ability',
              dims: { form: form.id, weapon, first, second: second ?? 'none', kind, payment },
              weapon: { baseId: weapon, primary: first, secondary: second },
              chains: {
                ...defaultChains(registry, first, weapon),
                basic: defaultBasic(registry, weapon, first, second),
                [form.slot]: {
                  moves: kinds.map((k) => ({ kind: k, form: form.id, elements })),
                  payment,
                },
              },
              hold: { slot: ABILITY_SLOTS.indexOf(form.slot) },
            });
          }
  }
  out.push(...runeRows(registry));
  out.push(...styleRows(registry));
  return out;
}

/**
 * The style view (the constructs spec §4.4): every weapon × attack form its
 * class allows, in Fire, the form's default chain at its slot's default
 * payment, no runes, the slot held. Each row averages `RUNE_SEEDS` seeds.
 */
function styleRows(registry: DataRegistry): DpsSetup[] {
  const out: DpsSetup[] = [];
  for (const base of registry.getGearBasesForSlot('weapon'))
    for (const form of attackForms(registry)) {
      if (!formAllowed(registry, base.id, form.id)) continue;
      const payment = defaultForm(registry, form.slot, weaponClass(registry, base.id)).payment;
      out.push({
        view: 'style',
        dims: { form: form.id, weapon: base.id },
        weapon: { baseId: base.id, primary: 'fire', secondary: null },
        chains: {
          ...defaultChains(registry, 'fire', base.id),
          basic: defaultBasic(registry, base.id, 'fire', null),
          [form.slot]: {
            moves: form.defaultChain.map((kind) => ({ kind, form: form.id, elements: FIRE })),
            payment,
          },
        },
        hold: { slot: ABILITY_SLOTS.indexOf(form.slot) },
      });
    }
  return out;
}
```

  (`FIRE` and `attackForms` are declared below `dpsCombos` as `const`/`function`: move `const FIRE` and `FIRE_FROST` above `dpsCombos`, or reference `['fire']` inline.) The rune view on its weapons: replace `runeSetup`'s signature and body head:

```ts
function runeSetup(
  registry: DataRegistry,
  on: string,
  ids: readonly string[],
  elements: ManaType[],
): DpsSetup {
  const runes = ids.map((id) => ({ id, tier: RUNE_TIER }));
  const [first, second = null] = elements;
  const form = attackForms(registry).find((f) => f.id === on);
  const baseId = form ? 'sword' : on;
```

  with:

```ts
function runeSetup(
  registry: DataRegistry,
  on: string,
  ids: readonly string[],
  elements: ManaType[],
  weapon?: string,
): DpsSetup {
  const runes = ids.map((id) => ({ id, tier: RUNE_TIER }));
  const [first, second = null] = elements;
  const form = attackForms(registry).find((f) => f.id === on);
  const baseId = weapon ?? (form ? referenceWeapons(registry, form.id)[0] : on);
```

  its `dims` becomes `{ rune: …, on, weapon: baseId, elements: …, tier: … }` and its `base` passes `baseId` as the fifth argument. In `runeRows`, replace the `ons` list and both maps so a form appears once per reference weapon:

```ts
  const ons: [string, string | undefined][] = [
    ...attackForms(registry).flatMap((f) =>
      referenceWeapons(registry, f.id).map((w): [string, string] => [f.id, w]),
    ),
    ...registry.getGearBasesForSlot('weapon').map((b): [string, undefined] => [b.id, undefined]),
  ];
  return [
    ...[FIRE, FIRE_FROST].flatMap((elements) =>
      ons.map(([on, w]) => runeSetup(registry, on, [], elements, w)),
    ),
    ...registry
      .getRunes()
      .flatMap((def) =>
        ons
          .filter(([on]) => fitsOn(registry, def, on))
          .map(([on, w]) => runeSetup(registry, on, [def.id], runeElements(registry, [def.id]), w)),
      ),
  ];
```

  `runeComboSetups(registry, on)` gains `weapon?: string` passed through to `runeSetup` (its doc: "on `weapon`, the form's first reference weapon by default"). In `packages/engine/src/index.ts`, add `referenceWeapons,` to the `./arpg/dps-sim.js` export list and `export { guardLand, surgeMult } from './arpg/abilities/defend.js';` in place of the `guardLand` line.

  In `packages/engine/tests/delve-rune-costs-gate.test.ts`, the two-build gate runs each form on each reference weapon: replace `for (const form of FORMS)` with `for (const form of FORMS) for (const weapon of referenceWeapons(registry, form as FormId))`, the `it` title gaining `` on a ${weapon}``, `runeComboSetups(registry, form)` becoming `runeComboSetups(registry, form, weapon)` (import `referenceWeapons` beside `runeComboSetups`, `FormId` from the types). The `delve-rune-sim`/`delve-rune-power` tests that pin `runeComboSetups(registry, 'bolt')` at 286 and `'sword'` at 165 stand (Detonate doesn't fit a Bolt or a sword's blows).

  In `packages/client/src/pages/DelveLab.tsx`, in `VIEWS` after `['rune', 'Runes'],` add `['style', 'Styles'],`.

- [ ] **Step 4: Run, expect PASS.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-dps-sim.test.ts tests/delve-rune-power.test.ts tests/delve-rune-sim.test.ts --reporter=dot)
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/lab --reporter=dot)
```

  Expected: all pass. The fingerprint doesn't move (the Lab is no part of a dive); check it anyway and keep the file.

- [ ] **Step 5: Commit** (the five files): `feat(engine): the Lab's style view; the ability and rune views on each form's reference weapon`.

### Task 12: The style gate

**Files:**
- Create: `packages/engine/tests/delve-style-gate.test.ts`

- [ ] **Step 1: The gate.** Create `packages/engine/tests/delve-style-gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dpsCombos, dpsKey, simulateDps, type DpsSetup } from '../src/arpg/dps-sim.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { weaponClass } from '../src/loot/moveset.js';

/**
 * The constructs spec's style gate (§4.4), at depth 10 and eight combat seeds a row, on one
 * dummy and on the pack: every weapon × attack form its class allows (the Lab's style view).
 * A form's rows are read against the median of that form across its class's weapons (a
 * shared form once per class), each within PAIR_BAND; each weapon's mean ratio over its forms
 * against the mean of all weapons, within WEAPON_BAND. Everything is printed. When it fails,
 * tune the style's numbers (`delve.json`), then its trait; never the band. Skipped unless
 * STYLE_GATE is set (a few minutes): `STYLE_GATE=1 npx vitest run tests/delve-style-gate.test.ts`.
 */

const DEPTH = 10;
const PAIR_BAND = [0.85, 1.2];
const WEAPON_BAND = [0.9, 1.1];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const x = (n: number) => n.toFixed(2);

describe.skipIf(!process.env.STYLE_GATE)('the style gate (depth 10, eight seeds)', () => {
  const registry = createDefaultRegistry();
  const rows = dpsCombos(registry).filter((s) => s.view === 'style');
  const runs = new Map<string, number>();
  const dps = (s: DpsSetup, pack: boolean) => {
    const key = `${pack}|${dpsKey(s)}`;
    if (!runs.has(key)) runs.set(key, simulateDps(registry, s, { depth: DEPTH, pack }).dps);
    return runs.get(key)!;
  };

  for (const pack of [false, true])
    it(`${pack ? 'the pack' : 'one dummy'}: each pair within ${PAIR_BAND.join('–')}× its form's class median, each weapon within ${WEAPON_BAND.join('–')}× the weapons' mean`, () => {
      /** Each row's ratio to the median of its form over its class's weapons. */
      const ratio = new Map<string, number>();
      const forms = [...new Set(rows.map((r) => r.dims.form))];
      const lines: string[] = [];
      for (const form of forms)
        for (const cls of ['melee', 'ranged'] as const) {
          const group = rows.filter(
            (r) => r.dims.form === form && weaponClass(registry, r.dims.weapon) === cls,
          );
          if (group.length === 0) continue;
          const med = median(group.map((r) => dps(r, pack)));
          for (const r of group) ratio.set(dpsKey(r), dps(r, pack) / med);
          lines.push(
            `${form.padEnd(10)} ${cls.padEnd(6)} ${group
              .map((r) => `${r.dims.weapon} ${x(ratio.get(dpsKey(r))!)}`)
              .join('  ')}`,
          );
        }
      const weapons = [...new Set(rows.map((r) => r.dims.weapon))];
      const weaponMean = new Map(
        weapons.map((w) => [
          w,
          mean(rows.filter((r) => r.dims.weapon === w).map((r) => ratio.get(dpsKey(r))!)),
        ]),
      );
      const all = mean([...weaponMean.values()]);
      lines.push(
        `weapons: ${weapons.map((w) => `${w} ${x(weaponMean.get(w)! / all)}`).join('  ')}`,
      );
      console.log(`${pack ? 'pack' : 'one dummy'}\n${lines.join('\n')}`);
      for (const [key, r] of ratio) {
        expect(r, key).toBeGreaterThanOrEqual(PAIR_BAND[0]);
        expect(r, key).toBeLessThanOrEqual(PAIR_BAND[1]);
      }
      for (const [w, m] of weaponMean) {
        expect(m / all, w).toBeGreaterThanOrEqual(WEAPON_BAND[0]);
        expect(m / all, w).toBeLessThanOrEqual(WEAPON_BAND[1]);
      }
    }, 900_000);
});
```

- [ ] **Step 2: Run the gate.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && STYLE_GATE=1 npx vitest run tests/delve-style-gate.test.ts)
```

  Expected: a table a layout; both tests pass, or a named pair or weapon outside its band. Tune only the style's numbers in `delve.json` (then its trait), one weapon at a time, re-running until both pass; write the final tables into the commit message. Expect the first read to fail on the maul (its ×1.25 power against its ×1.3 wind-up and ×1.15 cooldown lands near the band's top on a Strike chain) or the wand (×0.85 power on a Volley): move the one number nearest its cause by 0.05.

- [ ] **Step 3: The rune gates, re-run.**

```bash
(cd packages/engine && RUNE_COST_GATE=1 npx vitest run tests/delve-rune-costs-gate.test.ts)
```

  Expected: each form on each reference weapon prints its row; the floor (1.5×) and the band (2.0–3.0×) hold. A failure here is tuned the rune costs spec's way (`byForm`, `bySlot`, the ease, then the rows), never through the style numbers: note it for D2 if it needs more than one knob.

- [ ] **Step 4: The whole engine suite, the bundle and the client.**

```bash
cd /c/Projects/alloy-constructs-b1
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run --reporter=dot 2>&1 | tail -8)
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/lab --reporter=dot)
```

  Expected: all pass but the 2 known `delve-pacing-robust` failures (about 12 minutes); no type errors; the Lab tests pass. Re-record the fingerprint one last time (any tuning in Step 2 moved it) and keep `b1-after.json` for D1.

- [ ] **Step 5: Commit** (the gate test, any `delve.json` tuning): `test(engine): the style gate, each weapon a sidegrade within the spec's bands`.

---

## Open questions for the integrator

1. **A `stepBonus` knob** (Needs routed 3): add it in A beside `critBonus`, `cleave` and `homing`, or let B1's Task 10 add it? Either way one owner; if A adds it, Task 10's first block becomes a no-op.
2. **The maul's stagger on every kind** (Where the spec left room 8): the spec says heavy and hold moves; the knob staggers every cast. Accept, or should C2's header text read "Casts stagger" (as written) and the spec be amended?
3. **The DPS-sim grid counts** (Task 11): the ability view grows from 4320 to 7560 rows and the rune view's baselines from 30 to 42; the Lab's worker runs them all per request (about 1.75× longer). Fine for a dev tool, or should the Lab run only the chosen view's rows (a C2 change to `lab-worker.ts`)?
4. **`surgeMove` in the client:** if a tooltip or Help names "+20% move speed" for Surge, C2 rewrites it to the one multiplier (Needs routed 8).
5. **The melee Lance and Multi-shot:** the lunge ignores a Multi-shot's extra beams (Where the spec left room 4). The rune still fits Lance on a sword (the rune view measures it there): accept a dormant-in-effect rune on the melee Lance, or take `lance` off Multi-shot's `fits.forms` for melee weapons (a per-class fit the rune model doesn't have)?
