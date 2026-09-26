# Delve Combat Weight Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Delve combat weight: every basic attack and ability runs startup → strike → recovery in the engine (real lunges, commits, recoils, weight-based conjure times, per-weapon combo strings, a thrown Burst), and the client adds hit-stop, camera kick, anticipation, sweeping smears and dissolving effects.

**Architecture:** The engine owns every rule. Two new engine modules: `src/arpg/action.ts` (pushes placed by progress, cancelling a swing) and `src/arpg/basic.ts` (starting a swing and landing its strike; moved out of `step.ts`). `step.ts` orders them in `heroTick`, `cast.ts` gives abilities their conjure, motion and recovery, and heft rides on events to the client. The client stays display-only: a `HitStop` gate on the display clock, and new `fx/` helpers for anticipation, endings and lobs.

**Tech Stack:** TypeScript, Vitest (engine: Node; client: jsdom), PixiJS 8, Zod, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md`. Read it first.

**Conventions:**
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The branch is `claude/alloy-loot-gear-system-6upsy5`. Push with `git push -q origin claude/alloy-loot-gear-system-6upsy5` and never open a PR.
- After any engine `src` edit, rebuild with `pnpm -F @alloy/engine build` before running client tests or the dev server, because the client consumes the built engine.
- On Windows, run Python helper scripts from files (not heredocs) with `PYTHONIOENCODING=utf-8`.
- Format only the files you touched, with `npx prettier --write <files>` (never a whole folder).

**Commands:**
| What | Command (from repo root) |
|---|---|
| One engine test file | `cd packages/engine && npx vitest run tests/<file>.test.ts` |
| All engine tests | `cd packages/engine && npx vitest run` |
| Engine typecheck | `cd packages/engine && npx tsc --noEmit -p .` |
| Engine build | `pnpm -F @alloy/engine build` |
| Client tests | `cd packages/client && npx vitest run` |
| Client typecheck | `cd packages/client && npx tsc --noEmit -p .` |

## File map

**Engine (`packages/engine/`)**
| File | Change |
|---|---|
| `src/types/delve.ts` | `ComboStepDef`; `combo` on `GearBaseDef` and `HeroWeapon`; `FeelBalance`; `hero.defaultCombo` |
| `src/types/arpg.ts` | `FormDef.motion`; hero `swing`, `push`, `recoverUntil`; `windup.step`/`conjureUntil`/`chargePaid`; world `queuedCastUntil`, `queuedAttack`; `ArpgInput.attackTap`; `Projectile.heft`; `Zone.fromX/fromY/heft`; event `heft` fields |
| `src/types/ability.ts` | `ResolvedAbility.conjure/channel/heft/heavyKnockback/heavyStagger/motion` |
| `src/data/schemas.ts` | `ComboStepSchema`, gear-base `combo`, form `motion`, `hero.defaultCombo`, `feel` |
| `src/data/balance.json` | `delve.feel`, `delve.hero.defaultCombo` |
| `src/data/delve.json` | weapon `combo` strings; Twin Fang text |
| `src/data/arpg.json` | form `motion`; Burst `speed` |
| `src/delve/hero-stats.ts` | `weapon.combo`; `estimateCombat` from the string; `useInterval` uses `channel` |
| `src/arpg/action.ts` (new) | `startPush`, `pushTick`, `cancelSwing` |
| `src/arpg/basic.ts` (new) | `startSwing`, `strike`, `burstShot` (the basic attack, moved from `step.ts`) |
| `src/arpg/step.ts` | input recording, `heroTick` order, exploding basic shots, projectile/zone heft |
| `src/arpg/world.ts` | init new fields; `refreshWorldHero` resets the swing |
| `src/arpg/dodge.ts` | dodge cancels swing, push, recovery; refunds charge |
| `src/arpg/combat.ts` | `HitOpts.heft` → `hit` event |
| `src/arpg/abilities/resolve.ts` | conjure/channel/heft/heavy/motion; `stepHeft` |
| `src/arpg/abilities/cast.ts` | press-time combo step, cooldown from press + channel, step-in, recoil, recovery |
| `src/arpg/abilities/impact.ts` | `hitOpts` `direct` + heavy payoff + heft; chains indirect; `ImpactOpts.heft` |
| `src/arpg/abilities/forms.ts` | heft on direct hits; Burst thrown as a lob |
| `src/arpg/bot.ts` | no Primary during a swing startup |
| `src/index.ts` | export `stepHeft` |
| `tests/delve-combat-weight.test.ts` (new) | the feature's tests |
| `tests/fixtures/arena.ts` | `press()` steps past the wind-up; new `pressOnly()` |

**Client (`packages/client/src/`)**
| File | Change |
|---|---|
| `features/delve/arena/useArena.ts` | `attackTap`; HUD combo length; channel-only wind-up; hit-stop gate |
| `features/gamepad/arena-pad.ts` | `attackTap` on the attack button's press edge |
| `features/delve/arena/ArenaHud.tsx` | pips from the string length (all weapons) |
| `features/delve/AbilitiesPanel.tsx` | wind-up for every ability |
| `features/delve/PaperDoll.tsx` | attacks per second from the string |
| `features/delve/arena/ArenaRenderer.ts` | no fake lunge; camera kick; lean; swings per step; lifecycles |
| `features/delve/arena/fx/mana-fx.ts` | no lunge; sweeping swings; growing beams; `disperse`; `gather` at a point |
| `features/delve/arena/fx/mana-pixels.ts` | drop `lungeOffset` |
| `features/delve/arena/fx/draw-world.ts` | channel-only wind-up ring; `drawAnticipation`; `drawLobs`; pop-in projectiles |
| `features/delve/arena/fx/hitstop.ts` (new) | `hitstopMs`, `HitStop` |
| `features/delve/arena/fx/anticipation.ts` (new) | `windingUp(world)` |
| `features/delve/arena/fx/lifecycles.ts` (new) | births (muzzle, pop-in) and endings (dissolve) |

---

## Chunk 1: Data, types and ability timing

### Task 1: Combo strings, feel block and form motion (data + schema + types)

**Files:**
- Modify: `packages/engine/src/types/delve.ts`, `packages/engine/src/types/arpg.ts` (`FormDef`)
- Modify: `packages/engine/src/data/schemas.ts`, `balance.json`, `delve.json`, `arpg.json`
- Modify: `packages/engine/src/delve/hero-stats.ts` (weapon `combo`)
- Test: `packages/engine/tests/delve-combat-weight.test.ts` (new)

- [ ] **Step 0: Record the pacing baseline**

Before any change, record today's curve for Task 10's commit. Temporarily add `console.log(endDepthAt(1), endDepthAt(12))` to `tests/delve-pacing.test.ts`, run `cd packages/engine && npx vitest run tests/delve-pacing.test.ts`, note both numbers, and revert the log line.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/tests/delve-combat-weight.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { bal, gear, registry } from './fixtures/arena.js';

const weapons = registry.getDelveData().bases.filter((b) => b.slot === 'weapon');

describe('combat weight data', () => {
  it('every weapon swings a combo string, and the feel block loads', () => {
    expect(weapons.length).toBeGreaterThan(0);
    for (const w of weapons) {
      expect(w.combo?.length, w.id).toBeGreaterThan(0);
      for (const s of w.combo!) {
        expect(s.startup).toBeGreaterThan(0);
        expect(s.startup).toBeLessThan(1);
      }
    }
    expect(bal.hero.defaultCombo.length).toBeGreaterThan(0);
    expect(bal.feel.conjure).toHaveLength(5);
    expect(registry.getForm('bolt').motion).toBeLessThan(0);
    expect(registry.getForm('strike').motion).toBeGreaterThan(0);
  });

  it("keeps each string's damage per interval within 10% of today's", () => {
    for (const w of weapons) {
      const power = w.combo!.reduce((a, s) => a + s.power, 0);
      const time = w.combo!.reduce((a, s) => a + s.time, 0);
      const today = w.attack!.kind === 'melee' ? 3.5 / 3 : 1;
      expect(Math.abs(power / time / today - 1), w.id).toBeLessThanOrEqual(0.1);
    }
  });

  it('the hero carries the weapon string, and the default one when unarmed', () => {
    const maul = computeHeroStats({ weapon: gear('fire', 'weapon', 'maul') }, registry);
    expect(maul.weapon.combo).toHaveLength(2);
    expect(computeHeroStats({}, registry).weapon.combo).toEqual(bal.hero.defaultCombo);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts`
Expected: FAIL (`combo` undefined, `bal.feel` undefined).

- [ ] **Step 3: Add the types**

In `src/types/delve.ts`, above `GearBaseDef`:

```ts
/** One blow of a weapon's basic-attack string (`delve.json` weapon `combo`). */
export interface ComboStepDef {
  /** Share of the attack interval this blow takes: its cycle is `attackInterval × time`. */
  time: number;
  /** Share of the cycle before the strike (the startup). */
  startup: number;
  /** Units of motion: a lunge over the startup (melee) or a recoil after the release (negative, ranged). */
  move: number;
  /** Damage multiplier. */
  power: number;
  /** 0–1: how hard it lands (hit-stop, camera kick; never the rules). */
  heft: number;
  /** Melee: swing arc in degrees (defaults to the weapon's). */
  arc?: number;
  /** Melee: extra reach. */
  reach?: number;
  knockback?: number;
  stagger?: boolean;
  /** Ranged: projectile size multiplier. */
  size?: number;
  /** Ranged: the shot bursts over this radius on its first hit or at the end of its flight. */
  explode?: number;
  /** Ranged: projectile speed multiplier. */
  speed?: number;
}
```

Add `combo?: ComboStepDef[];` to `GearBaseDef` (doc: `/** Weapons only: the basic-attack string (else the hero's default string). */`). Add `combo: ComboStepDef[];` to `HeroWeapon` (doc: `/** The basic-attack string, one entry per blow. */`).

In `DelveBalance.hero` add:

```ts
    /** The string for weapons without one (and unarmed). */
    defaultCombo: ComboStepDef[];
```

Add this interface and a `feel: FeelBalance;` member on `DelveBalance` (after `dodge`):

```ts
/** Combat weight: action timing and motion. Arrays run Swift → Crushing (ability weight −2..2). */
export interface FeelBalance {
  /** Conjure seconds by ability weight. */
  conjure: number[];
  conjureSlot: { primary: number; defensive: number; ultimate: number };
  /** Slowed seconds after an ability lands, by weight (the Defensive has none). */
  recovery: number[];
  /** Ability heft by weight. */
  heft: number[];
  /** Move speed multiplier during a recovery. */
  recoveryMove: number;
  /** Share of a basic's cycle after its strike spent recovering. */
  basicRecovery: number;
  /** Ability motion grows by this per weight step. */
  motionPerWeight: number;
  recoilSeconds: number;
  /** A lunge stops when the gap between the hero's and the foe's edges is this small. */
  contactGap: number;
  /** Seconds a press waits past the end of whatever keeps the hero busy. */
  buffer: number;
  /** Knockback per weight step above Balanced, on direct hits. */
  heavyKnockback: number;
  /** A thrown Burst's minimum flight in seconds. */
  lobBase: number;
}
```

In `src/types/arpg.ts`, `FormDef`, after `comboCount`:

```ts
  /** Units the hero moves when casting: positive steps in over the conjure, negative recoils after the release. */
  motion?: number;
```

- [ ] **Step 4: Add the schemas**

In `src/data/schemas.ts`, above `DelveDataSchema`:

```ts
const ComboStepSchema = z.object({
  time: z.number().positive(),
  startup: z.number().gt(0).lt(1),
  move: z.number(),
  power: z.number().positive(),
  heft: z.number().min(0).max(1),
  arc: z.number().positive().max(360).optional(),
  reach: z.number().min(0).optional(),
  knockback: z.number().min(0).optional(),
  stagger: z.boolean().optional(),
  size: z.number().positive().optional(),
  explode: z.number().positive().optional(),
  speed: z.number().positive().optional(),
});
```

In the gear-base object, after `attack`: `combo: z.array(ComboStepSchema).min(1).optional(),`
In the form object, after `comboCount`: `motion: z.number().optional(),`
In `DelveBalanceSchema.hero`, after `basicComboGrace`: `defaultCombo: z.array(ComboStepSchema).min(1),`
In `DelveBalanceSchema`, after `dodge`:

```ts
  feel: z.object({
    conjure: z.array(z.number().min(0)).length(5),
    conjureSlot: z.object({
      primary: z.number().min(0),
      defensive: z.number().min(0),
      ultimate: z.number().min(0),
    }),
    recovery: z.array(z.number().min(0)).length(5),
    heft: z.array(z.number().min(0).max(1)).length(5),
    recoveryMove: z.number().min(0).max(1),
    basicRecovery: z.number().min(0).max(1),
    motionPerWeight: z.number().min(0),
    recoilSeconds: z.number().positive(),
    contactGap: z.number().min(0),
    buffer: z.number().min(0),
    heavyKnockback: z.number().min(0),
    lobBase: z.number().min(0),
  }),
```

- [ ] **Step 5: Add the data**

`balance.json → delve.hero`, after `basicComboGrace`:

```json
"defaultCombo": [
  { "time": 0.9, "startup": 0.3, "move": 0.3, "power": 1.0, "heft": 0.2 },
  { "time": 0.9, "startup": 0.3, "move": 0.3, "power": 1.0, "heft": 0.2 },
  { "time": 1.2, "startup": 0.35, "move": 0.5, "power": 1.3, "heft": 0.4, "knockback": 0.3 }
],
```

`balance.json → delve`, after `dodge`:

```json
"feel": {
  "conjure": [0.04, 0.08, 0.14, 0.24, 0.38],
  "conjureSlot": { "primary": 1, "defensive": 0.5, "ultimate": 1.6 },
  "recovery": [0.06, 0.1, 0.16, 0.24, 0.34],
  "heft": [0.15, 0.3, 0.45, 0.7, 1.0],
  "recoveryMove": 0.4,
  "basicRecovery": 0.35,
  "motionPerWeight": 0.3,
  "recoilSeconds": 0.08,
  "contactGap": 0.15,
  "buffer": 0.25,
  "heavyKnockback": 0.25,
  "lobBase": 0.12
},
```

`delve.json`: add a `combo` to each weapon base (after `attack`):

| Base | `combo` |
|---|---|
| dagger | `[{"time":0.8,"startup":0.3,"move":0.25,"power":0.8,"heft":0.15},{"time":0.8,"startup":0.3,"move":0.25,"power":0.8,"heft":0.15},{"time":0.8,"startup":0.3,"move":0.3,"power":0.9,"heft":0.15},{"time":1.4,"startup":0.35,"move":0.7,"power":1.7,"heft":0.6,"arc":150,"knockback":0.3}]` |
| sword | `[{"time":0.9,"startup":0.3,"move":0.4,"power":1.0,"heft":0.3},{"time":0.9,"startup":0.3,"move":0.4,"power":1.0,"heft":0.3},{"time":1.3,"startup":0.4,"move":1.2,"power":1.7,"heft":0.8,"arc":50,"reach":0.9,"knockback":0.6}]` |
| axe | `[{"time":0.9,"startup":0.35,"move":0.3,"power":1.0,"heft":0.4},{"time":0.9,"startup":0.35,"move":0.3,"power":1.0,"heft":0.4},{"time":1.3,"startup":0.4,"move":0.5,"power":1.7,"heft":0.8,"arc":360,"knockback":0.5}]` |
| maul | `[{"time":1.0,"startup":0.45,"move":0.5,"power":1.0,"heft":0.6,"arc":140},{"time":1.3,"startup":0.5,"move":0.7,"power":1.8,"heft":1.0,"arc":360,"reach":0.4,"knockback":0.8,"stagger":true}]` |
| wand | `[{"time":0.9,"startup":0.2,"move":-0.05,"power":0.9,"heft":0.1},{"time":0.9,"startup":0.2,"move":-0.05,"power":0.9,"heft":0.1},{"time":1.2,"startup":0.25,"move":-0.1,"power":1.3,"heft":0.3,"size":1.5}]` |
| staff | `[{"time":0.9,"startup":0.3,"move":-0.1,"power":0.9,"heft":0.2},{"time":0.9,"startup":0.3,"move":-0.1,"power":0.9,"heft":0.2},{"time":1.3,"startup":0.45,"move":-0.3,"power":1.4,"heft":0.6,"size":1.8,"explode":1.0}]` |
| bow | `[{"time":0.85,"startup":0.35,"move":-0.05,"power":0.85,"heft":0.2},{"time":0.85,"startup":0.35,"move":-0.05,"power":0.85,"heft":0.2},{"time":1.4,"startup":0.6,"move":-0.2,"power":1.6,"heft":0.6,"speed":1.4}]` |

In `delve.json`, change Twin Fang's `text` to `"The last blow of each basic-attack combo strikes again for {v}% damage."`.

In `arpg.json`, add `motion` to these forms: bolt `-0.15`, volley `-0.1`, lance `-0.3`, burst `0.2`, strike `0.5`, barrage `0.15`, maelstrom `0.2`. Add `"speed": 30` to burst.

Make these JSON edits by hand with the Edit tool, matching each file's existing formatting. Re-serialising with `json.dump` reformats hundreds of unrelated lines. Check `git diff --stat` shows only small changes.

- [ ] **Step 6: Give the hero the string**

In `src/delve/hero-stats.ts`, where `weapon: HeroWeapon` is built, add `combo: weaponBase.combo ?? bal.hero.defaultCombo,` to the armed branch and `combo: bal.hero.defaultCombo` to the unarmed object (`bal` is the delve balance already in scope; if it isn't, use `registry.getDelveBalance()`).

- [ ] **Step 7: Run the test and the typecheck**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts && npx tsc --noEmit -p .`
Expected: 3 tests PASS; typecheck clean. If `tsc` flags another place that builds a `HeroWeapon` or a `DelveBalance` (tools, fixtures), add the new field there too.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src packages/engine/tests/delve-combat-weight.test.ts
git commit -m "feat(engine): weapon combo strings and the feel balance block"
```

### Task 2: Ability timing from weight (resolve)

**Files:**
- Modify: `packages/engine/src/types/ability.ts`, `src/arpg/abilities/resolve.ts`, `src/index.ts`
- Test: `packages/engine/tests/delve-combat-weight.test.ts`, `tests/ability-resolve.test.ts` (update)

- [ ] **Step 1: Write the failing tests**

Append to `tests/delve-combat-weight.test.ts` (add the imports to the top):

```ts
import { resolveAbility, stepHeft } from '../src/arpg/abilities/resolve.js';
import type { AbilityBuild, AbilitySlot } from '../src/types/ability.js';

const stats = computeHeroStats({ weapon: gear('fire') }, registry);
const resolve = (slot: AbilitySlot, b: Partial<AbilityBuild> & Pick<AbilityBuild, 'form'>) =>
  resolveAbility(registry, slot, { elements: ['fire'], weight: 0, payment: 'mana', ...b }, stats);

describe('ability timing from weight', () => {
  it('conjure grows with weight and by slot; cast payment adds its channel', () => {
    expect(resolve('primary', { form: 'bolt', weight: -2 }).conjure).toBeCloseTo(0.04);
    const crushing = resolve('primary', { form: 'bolt', weight: 2 });
    expect(crushing.conjure).toBeCloseTo(0.38);
    expect(crushing.channel).toBe(0);
    expect(resolve('defensive', { form: 'ward' }).conjure).toBeCloseTo(0.07);
    expect(resolve('ultimate', { form: 'nova', payment: 'charge' }).conjure).toBeCloseTo(0.224);
    const cast = resolve('primary', { form: 'bolt', payment: 'cast' });
    expect(cast.channel).toBeCloseTo(bal.abilities.slots.primary.castTime);
  });

  it('heft and the heavy payoff come from weight', () => {
    const swift = resolve('primary', { form: 'bolt', weight: -2 });
    const crushing = resolve('primary', { form: 'bolt', weight: 2 });
    expect(swift.heft).toBeCloseTo(0.15);
    expect(swift.heavyKnockback).toBe(0);
    expect(swift.heavyStagger).toBe(false);
    expect(crushing.heft).toBeCloseTo(1);
    expect(crushing.heavyKnockback).toBeCloseTo(0.5);
    expect(crushing.heavyStagger).toBe(true);
    const bolt = resolve('primary', { form: 'bolt' });
    expect(stepHeft(bolt, 0)).toBeCloseTo(0.45);
    expect(stepHeft(bolt, bolt.combo.length - 1)).toBeCloseTo(0.65);
    // One-press forms get no last-press bonus; ultimates +0.2.
    expect(stepHeft(resolve('ultimate', { form: 'nova', payment: 'charge' }), 0)).toBeCloseTo(0.65);
  });

  it('motion scales with weight', () => {
    expect(resolve('primary', { form: 'bolt' }).motion).toBeCloseTo(-0.15);
    expect(resolve('primary', { form: 'bolt', weight: 2 }).motion).toBeCloseTo(-0.24);
    expect(resolve('primary', { form: 'strike' }).motion).toBeCloseTo(0.5);
    expect(resolve('defensive', { form: 'ward' }).motion).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts`
Expected: FAIL (`conjure` undefined, `stepHeft` not exported).

- [ ] **Step 3: Implement**

In `src/types/ability.ts`, `ResolvedAbility`, add after `castTime` (its doc changes in Task 6, when it becomes conjure + channel):

```ts
  /** Seconds of anticipation from the weight (every ability). */
  conjure: number;
  /** Seconds of channel (cast payment only). */
  channel: number;
  /** 0–1: how hard its direct hits land (client feel only). */
  heft: number;
  /** Extra knockback on direct hits (Heavy, Crushing). */
  heavyKnockback: number;
  /** Direct hits stagger (Crushing). */
  heavyStagger: boolean;
  /** Units moved when cast: + steps in over the conjure, − recoils after the release. */
  motion: number;
```

In `src/arpg/abilities/resolve.ts`, inside `resolveAbility` after `const size = …`:

```ts
  const F = bal.feel;
  const wi = w + 2;
  const conjure = F.conjure[wi] * F.conjureSlot[slot];
  const channel = cast ? s.castTime * (1 + W.castTime * w) : 0;
```

Replace the `castTime:` line of the returned object with the lines below. `castTime` keeps meaning the channel for now, so today's casting code is unchanged until Task 6 gives every ability a wind-up.

```ts
    castTime: channel,
    conjure,
    channel,
    heft: Math.min(1, F.heft[wi] + (slot === 'ultimate' ? 0.2 : 0)),
    heavyKnockback: Math.max(0, w) * F.heavyKnockback,
    heavyStagger: w >= 2,
    motion: (form.motion ?? 0) * (1 + F.motionPerWeight * w),
```

At the end of the file:

```ts
/** How hard press-combo `step` lands: the ability's heft, +0.2 on the last press of a 2+ press combo. */
export function stepHeft(ab: ResolvedAbility, step: number): number {
  const n = ab.combo.length;
  return Math.min(1, ab.heft + (n > 1 && step % n === n - 1 ? 0.2 : 0));
}
```

In `src/index.ts`, extend the resolve export: `export { resolveAbility, mergeKnobs, defaultAbilities, stepHeft } from './arpg/abilities/resolve.js';`

- [ ] **Step 4: Run the tests**

Run: `cd packages/engine && npx vitest run && npx tsc --noEmit -p .`
Expected: the whole suite PASSES (nothing reads the new fields yet) and the typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src packages/engine/tests
git commit -m "feat(engine): ability weight sets a conjure time, heft and heavy payoff"
```

---

## Chunk 2: The basic-attack action model

### Task 3: Action state, pushes and buffered input

**Files:**
- Modify: `packages/engine/src/types/arpg.ts`, `src/arpg/world.ts`, `src/arpg/step.ts` (`stepWorld` only), `src/arpg/combat.ts` (`HitOpts.heft`)
- Create: `packages/engine/src/arpg/action.ts`
- Test: `packages/engine/tests/delve-combat-weight.test.ts`
- Modify: `docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md` (buffer wording)

- [ ] **Step 1: Write the failing tests**

Append:

```ts
import { stepWorld } from '../src/arpg/step.js';
import { makeCtx } from '../src/arpg/combat.js';
import { pushTick, startPush } from '../src/arpg/action.js';
import { arena, dummy, STEP } from './fixtures/arena.js';

describe('pushes and buffered input', () => {
  it('a push places the hero by progress and covers its distance even inside one tick', () => {
    const w = arena([], { noBasic: true });
    const ctx = makeCtx(registry, w, []);
    const y0 = w.hero.y;
    startPush(ctx, { x: 0, y: -1 }, 0.3, STEP / 2);
    w.t += STEP;
    expect(pushTick(ctx)).toBe(true);
    expect(y0 - w.hero.y).toBeCloseTo(0.3, 5);
    expect(w.hero.push).toBeNull();
  });

  it('a push toward a foe stops exactly at the contact gap', () => {
    const w = arena([dummy(13, 0)], { noBasic: true });
    const m = w.monsters[0];
    m.y = w.hero.y - w.hero.radius - m.radius - 1;
    const y0 = w.hero.y;
    const ctx = makeCtx(registry, w, []);
    startPush(ctx, { x: 0, y: -1 }, 2, 0.2, m.id);
    for (let i = 0; i < 10; i++) {
      w.t += STEP;
      pushTick(ctx);
    }
    const gap = Math.abs(w.hero.y - m.y) - m.radius - w.hero.radius;
    expect(gap).toBeCloseTo(bal.feel.contactGap, 4);
    expect(y0 - w.hero.y).toBeCloseTo(1 - bal.feel.contactGap, 4);
    expect(w.hero.push).toBeNull();
  });

  it('presses made while the display is frozen (dt 0) are kept', () => {
    const w = arena([dummy(13, 34.6)]);
    stepWorld(registry, w, { move: { x: 0, y: 0 }, attack: false, attackTap: true }, 0);
    stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: { slot: 0 } }, 0);
    expect(w.queuedAttack).toMatchObject({ aim: null });
    expect(w.queuedCast).toEqual({ slot: 0 });
    expect(w.queuedCastUntil).toBeGreaterThan(w.t);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts`
Expected: FAIL (`action.js` missing).

- [ ] **Step 3: Add the state**

In `src/types/arpg.ts`:

`HeroEntity`, after `windup`:

```ts
  /** A basic attack in its startup: the blow lands at `strikeAt`. */
  swing: {
    step: number;
    dir: Vec;
    targetId: number | null;
    start: number;
    strikeAt: number;
    /** Committed swings root the hero, lunge and leave a recovery (automatic swings on the move don't). */
    committed: boolean;
  } | null;
  /** Motion an action imposes (a lunge, a step-in or a recoil), placed by progress; it replaces move input. */
  push: {
    fromX: number;
    fromY: number;
    dx: number;
    dy: number;
    start: number;
    until: number;
    /** Stop at this foe's edge (a lunge), or null. */
    stopId: number | null;
  } | null;
  /** Movement is slowed until this time (after a strike or a landed ability). */
  recoverUntil: number;
```

Change the `attackCount` doc to `/** Blows landed in the current string (resets after a pause). */`.

`ArpgInput`, after `attack`:

```ts
  /** Manual attacks: the attack was pressed this frame (kept briefly if the hero is busy). */
  attackTap?: boolean;
```

`ArpgWorld`, after `queuedCast`:

```ts
  /** The queued cast is dropped after this time: the end of whatever kept the hero busy, plus the buffer. */
  queuedCastUntil: number;
  /** A manual attack tap waiting for the weapon (see `queuedCastUntil`). */
  queuedAttack: { until: number; aim: Vec | null } | null;
```

`Projectile`, after `knockback`: `/** How hard its hit lands (client feel). */ heft?: number;`

`Zone`, after `detonateAt`:

```ts
  /** A thrown Burst: where it was thrown from (for the arc). */
  fromX?: number;
  fromY?: number;
  /** How hard its landing hits (client feel). */
  heft?: number;
```

Events: add `heft: number` to `hit`, and `heft: number` to `cast` and to `windup` (the `basic` event's new fields come in Task 4, together with the code that fills them). Then fix every `ctx.events.push({ kind: 'hit' …` (the shatter one in `combat.ts` gets `heft: 0`), and add `heft: 0` to the `cast`/`windup` pushes in `cast.ts` for now (Task 6 sets real values).

In `src/arpg/combat.ts`, `HitOpts`, add:

```ts
  /** 0–1: how hard the hit lands (client feel; 0 for ticks, DoTs, chains). */
  heft?: number;
```

and in `hitMonster`'s event push: `ctx.events.push({ kind: 'hit', id: m.id, x: m.x, y: m.y, amount, crit, element, reaction, heft: opts.heft ?? 0 });`

In `src/arpg/world.ts` `createHeroEntity`, after `windup: null,` add `swing: null, push: null, recoverUntil: 0,`. In `createFloorWorld`, after `queuedCast: null,` add `queuedCastUntil: 0, queuedAttack: null,`. In `refreshWorldHero`, before `h.stats = stats;` add:

```ts
  // A weapon with a different string starts it over (a blow in progress is dropped and the
  // weapon is ready); other gear changes leave the swing alone.
  if (stats.weapon.combo !== h.stats.weapon.combo) {
    h.swing = null;
    h.push = null;
    h.attackCount = 0;
    h.nextAttackAt = Math.min(h.nextAttackAt, world.t);
  }
```

- [ ] **Step 4: Create `src/arpg/action.ts`**

```ts
import type { Vec } from '../types/arpg.js';
import type { SimCtx } from './combat.js';
import { clamp } from './geometry.js';

/**
 * Motion and cancels for the hero's actions. A push (a lunge, an ability's
 * step-in or a recoil) is placed by progress like the dodge's dash, so even
 * a push shorter than one tick covers its distance, and a lunge stops at
 * the edge of the foe it lunges at.
 */

/** Move the hero `distance` units along `dir` over `seconds`; with `stopId`, stop at that foe. */
export function startPush(
  ctx: SimCtx,
  dir: Vec,
  distance: number,
  seconds: number,
  stopId: number | null = null,
): void {
  const h = ctx.world.hero;
  const t = ctx.world.t;
  h.push = {
    fromX: h.x,
    fromY: h.y,
    dx: dir.x * distance,
    dy: dir.y * distance,
    start: t,
    until: t + Math.max(1e-6, seconds),
    stopId,
  };
}

/**
 * How far (0..1) along the move from (ax, ay) to (bx, by) the hero comes
 * within `reach` of the point (fx, fy); 1 when it never does.
 */
function contactAt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  fx: number,
  fy: number,
  reach: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const ox = ax - fx;
  const oy = ay - fy;
  const a = dx * dx + dy * dy;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - reach * reach;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (a < 1e-12 || disc < 0) return 1;
  const k = (-b - Math.sqrt(disc)) / (2 * a);
  return k >= 0 && k <= 1 ? k : 1;
}

/**
 * Carry the push; true while it moves (or holds) the hero this step.
 * `finish` jumps to its end (a wind-up landing finishes its step-in first).
 */
export function pushTick(ctx: SimCtx, finish = false): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const p = h.push;
  if (!p) return false;
  const k = finish ? 1 : Math.min(1, (world.t - p.start) / (p.until - p.start));
  const x = clamp(p.fromX + p.dx * k, h.radius, world.width - h.radius);
  const y = clamp(p.fromY + p.dy * k, h.radius, world.height - h.radius);
  const foe = p.stopId === null ? null : world.monsters.find((m) => m.id === p.stopId && !m.dead);
  const c = foe
    ? contactAt(h.x, h.y, x, y, foe.x, foe.y, foe.radius + h.radius + bal.feel.contactGap)
    : 1;
  // Stop exactly at the contact gap, never inside it.
  h.x += (x - h.x) * c;
  h.y += (y - h.y) * c;
  if (c < 1 || k >= 1) h.push = null;
  return true;
}

/** Drop a basic swing still in its startup: no blow, no string step, and the weapon is ready again. */
export function cancelSwing(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.swing) return;
  h.swing = null;
  h.push = null;
  h.nextAttackAt = ctx.world.t;
}
```

- [ ] **Step 5: Record presses before stepping**

In `src/arpg/step.ts` `stepWorld`, replace `if (input.cast) world.queuedCast = input.cast;` with:

```ts
  const buffer = registry.getDelveBalance().feel.buffer;
  const h = world.hero;
  if (input.cast) {
    // A press waits out a wind-up or a dash, then gets `buffer` more seconds.
    const busy = Math.max(h.windup?.until ?? 0, h.dodge?.until ?? 0);
    world.queuedCast = input.cast;
    world.queuedCastUntil = Math.max(world.t, busy) + buffer;
  }
  // A tap waits for the weapon (the current blow's cycle), then `buffer` more.
  if (input.attackTap)
    world.queuedAttack = {
      until: Math.max(world.t, h.nextAttackAt) + buffer,
      aim: input.attackAim ?? null,
    };
```

Update the spec's Input buffer section to match: a press is kept until the end of whatever keeps the hero busy (the wind-up, the dash, or for a tap the weapon's current cycle) plus `buffer`, and it is stored as `until` instead of the press time.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts && npx tsc --noEmit -p .`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/engine docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md
git commit -m "feat(engine): action pushes, heft on hits and buffered presses"
```

### Task 4: Swings with startup, strike and recovery

**Files:**
- Create: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/src/arpg/step.ts` (`heroTick`, remove `basicAttack` and `BASIC_STATUS*`, exploding shots, projectile heft), `src/arpg/dodge.ts`
- Test: `packages/engine/tests/delve-combat-weight.test.ts`, `tests/delve-manual-attack.test.ts` (update)

- [ ] **Step 1: Write the failing tests**

Append (add `dist` from `../src/arpg/geometry.js`, `refreshWorldHero` from `../src/arpg/world.js`, and `damaged`, `dodge`, `run`, `DEFAULT_BUILDS` from the fixture to the imports):

```ts
import type { ArpgEvent, ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';

/** Put the first foe `gap` units from the hero's edge along `dir` (default straight up). */
function place(w: ArpgWorld, gap: number, dir: Vec = { x: 0, y: -1 }, i = 0): void {
  const m = w.monsters[i];
  const d = w.hero.radius + m.radius + gap;
  m.x = w.hero.x + dir.x * d;
  m.y = w.hero.y + dir.y * d;
}
const basics = (events: ArpgEvent[]) => events.filter((e) => e.kind === 'basic');
const still = { x: 0, y: 0 };
function until(
  w: ArpgWorld,
  done: () => boolean,
  input: ArpgInput = { move: still },
  max = 300,
): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < max && !done(); i++) events.push(...stepWorld(registry, w, input, STEP));
  return events;
}

describe('basic attacks: startup, strike, recovery', () => {
  it('a committed melee swing lunges in, and the blow lands at the strike', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.6);
    const y0 = w.hero.y;
    const s = w.hero.stats.weapon.combo[0];
    run(w, STEP);
    const sw = w.hero.swing!;
    expect(sw.committed).toBe(true);
    run(w, (sw.strikeAt - w.t) * 0.5);
    expect(damaged(w.monsters[0])).toBe(false);
    const events = until(w, () => w.hero.swing === null);
    expect(basics(events)).toHaveLength(1);
    expect(damaged(w.monsters[0])).toBe(true);
    expect(y0 - w.hero.y).toBeCloseTo(s.move, 2);
  });

  it('the lunge stops short of the foe', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.25);
    const y0 = w.hero.y;
    until(w, () => w.hero.swing === null && w.t > 0.1);
    const m = w.monsters[0];
    expect(dist(w.hero.x, w.hero.y, m.x, m.y) - m.radius - w.hero.radius).toBeGreaterThan(0.1);
    expect(y0 - w.hero.y).toBeLessThan(0.15);
  });

  it('ignores movement through a committed startup, then slows it in recovery only', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    run(w, STEP);
    const x0 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.x).toBe(x0);
    until(w, () => w.hero.swing === null);
    const x1 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    const pace = w.hero.stats.moveSpeed * STEP;
    expect(w.hero.x - x1).toBeCloseTo(pace * bal.feel.recoveryMove, 4);
    until(w, () => w.t >= w.hero.recoverUntil);
    expect(w.t).toBeLessThan(w.hero.nextAttackAt);
    const x2 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.x - x2).toBeCloseTo(pace, 4);
  });

  it('a committed shot roots the hero through its startup, with no push involved', () => {
    const w = arena([dummy(13, 30)], { equipped: { weapon: gear('fire', 'weapon', 'wand') } });
    stepWorld(registry, w, { move: still, attack: true }, STEP);
    expect(w.hero.swing?.committed).toBe(true);
    expect(w.hero.push).toBeNull();
    const x0 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 }, attack: true }, STEP);
    expect(w.hero.x).toBe(x0);
  });

  it('automatic swings on the move neither root, lunge nor slow', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    const x0 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.swing?.committed).toBe(false);
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.x - x0).toBeCloseTo(2 * w.hero.stats.moveSpeed * STEP, 4);
    expect(w.hero.push).toBeNull();
  });

  it('a dodge in the startup cancels the swing', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    run(w, STEP);
    expect(w.hero.swing).not.toBeNull();
    dodge(w, { x: 1, y: 0 });
    expect(w.hero.swing).toBeNull();
    expect(w.hero.nextAttackAt).toBeLessThanOrEqual(w.t);
    expect(w.hero.attackCount).toBe(0);
    expect(damaged(w.monsters[0])).toBe(false);
  });
});

describe('weapon strings', () => {
  it("the sword's third blow is the finisher thrust", () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    const all = until(w, () => w.hero.attackCount >= 3);
    const b = basics(all);
    expect(b.map((e) => e.kind === 'basic' && e.step)).toEqual([0, 1, 2]);
    expect(b.map((e) => e.kind === 'basic' && e.finisher)).toEqual([false, false, true]);
    const thrust = w.hero.stats.weapon.combo[2];
    expect(thrust.reach).toBeGreaterThan(0);
    expect(thrust.arc).toBeLessThan(w.hero.stats.weapon.arc);
  });

  it('only the thrust knocks the foe back', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    const m = w.monsters[0];
    until(w, () => w.hero.attackCount >= 2);
    expect(Math.hypot(m.kbx, m.kby)).toBe(0);
    until(w, () => w.hero.attackCount >= 3);
    expect(Math.hypot(m.kbx, m.kby)).toBeGreaterThan(0);
  });

  it("the maul's overhead misses what's behind; its slam hits all around and staggers", () => {
    const w = arena([dummy(13, 0), dummy(13, 0)], {
      equipped: { weapon: gear('fire', 'weapon', 'maul') },
    });
    place(w, 0.4, { x: 0, y: -1 }, 0);
    place(w, 1.0, { x: 0, y: 1 }, 1);
    until(w, () => w.hero.attackCount >= 1);
    expect(damaged(w.monsters[1])).toBe(false);
    until(w, () => w.hero.attackCount >= 2);
    expect(damaged(w.monsters[1])).toBe(true);
    expect(w.monsters[1].status.staggerUntil).toBeGreaterThan(w.t);
  });

  it('a string resets after a pause', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    until(w, () => w.hero.attackCount >= 1);
    const foe = { ...w.monsters[0] };
    w.monsters = [];
    run(w, w.hero.stats.attackInterval + bal.hero.basicComboGrace + 0.1);
    w.monsters = [foe];
    until(w, () => w.hero.swing !== null);
    expect(w.hero.swing!.step).toBe(0);
  });

  it('a new weapon starts its own string; other gear keeps the swing', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    until(w, () => w.hero.attackCount >= 1);
    until(w, () => w.hero.swing !== null);
    // Same weapon base (same string): the swing carries on.
    refreshWorldHero(registry, w, computeHeroStats({ weapon: gear('fire') }, registry), DEFAULT_BUILDS);
    expect(w.hero.swing).not.toBeNull();
    expect(w.hero.attackCount).toBe(1);
    // A maul: the swing is dropped, the string restarts and the weapon is ready.
    refreshWorldHero(registry, w, computeHeroStats({ weapon: gear('fire', 'weapon', 'maul') }, registry), DEFAULT_BUILDS);
    expect(w.hero.swing).toBeNull();
    expect(w.hero.attackCount).toBe(0);
    expect(w.hero.nextAttackAt).toBeLessThanOrEqual(w.t);
  });

  it('a committed shot recoils after the release; one on the move does not', () => {
    const wand = { weapon: gear('fire', 'weapon', 'wand') };
    const w = arena([dummy(13, 30)], { equipped: wand });
    const y0 = w.hero.y;
    until(w, () => w.hero.attackCount >= 1);
    run(w, bal.feel.recoilSeconds + STEP);
    expect(w.hero.y - y0).toBeCloseTo(-w.hero.stats.weapon.combo[0].move, 2);

    const m = arena([dummy(13, 30)], { equipped: wand });
    const my0 = m.hero.y;
    until(m, () => m.hero.attackCount >= 1, { move: { x: 1, y: 0 } });
    run(m, bal.feel.recoilSeconds + STEP, { x: 1, y: 0 });
    expect(m.hero.y).toBeCloseTo(my0, 6);
  });

  it("the staff's great orb bursts over a crowd", () => {
    const w = arena([dummy(13, 30), dummy(13.7, 30), dummy(12.3, 30)], {
      equipped: { weapon: gear('fire', 'weapon', 'staff') },
    });
    w.hero.attackCount = 2;
    w.hero.lastBasicAt = 0;
    const events = until(w, () => w.monsters.every(damaged), { move: still }, 120);
    expect(events.some((e) => e.kind === 'explode')).toBe(true);
    expect(w.monsters.every(damaged)).toBe(true);
  });

  it("Twin Fang strikes again on the string's last blow, at today's value (melee ×1.5)", () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    w.hero.stats.legendaries.twin_fang = 100;
    const events = until(w, () => w.hero.attackCount >= 3);
    const blows = events.filter((e) => e.kind === 'hit' && e.heft > 0);
    expect(blows).toHaveLength(4);
    const [thrust, twin] = blows.slice(2) as Extract<ArpgEvent, { kind: 'hit' }>[];
    // Same swing, same crit roll and resistances: only the multipliers differ.
    expect(twin.amount / thrust.amount).toBeCloseTo(1.5 / w.hero.stats.weapon.combo[2].power, 2);
  });

  it('ranged Twin Fang fires a second shot at ×1.0, copying the size but never exploding', () => {
    // The staff's last blow is the exploding great orb: its twin must not burst.
    const w = arena([dummy(13, 33)], { equipped: { weapon: gear('fire', 'weapon', 'staff') } });
    w.hero.stats.legendaries.twin_fang = 100;
    w.hero.attackCount = 2;
    w.hero.lastBasicAt = 0;
    until(w, () => w.projectiles.length > 0);
    expect(w.projectiles).toHaveLength(2);
    expect(w.projectiles[1].radius).toBeCloseTo(w.projectiles[0].radius);
    expect(w.projectiles[1].explodeRadius).toBe(0);
    expect(w.projectiles[1].damage / w.projectiles[0].damage).toBeCloseTo(
      1 / w.hero.stats.weapon.combo[2].power,
      5,
    );
  });

  it('a tap during a swing is kept and starts the next blow', () => {
    const w = arena([dummy(13, 34.6)]);
    stepWorld(registry, w, { move: still, attack: true, attackTap: true }, STEP);
    expect(w.hero.swing).not.toBeNull();
    stepWorld(registry, w, { move: still, attack: false, attackTap: true }, STEP);
    const events = until(w, () => w.hero.attackCount >= 2, { move: still, attack: false });
    expect(basics(events).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts`
Expected: FAIL (no `swing` is ever set).

- [ ] **Step 3: Create `src/arpg/basic.ts`**

First add the `basic` event's new fields in `src/types/arpg.ts`: `heft: number; step: number; dir: Vec; finisher: boolean` (the old `basicAttack` push in `step.ts` goes away in Step 4, so nothing else needs them).

Move `BASIC_STATUS` and `BASIC_STATUS_CHANCE` from `step.ts` into this file:

```ts
import type { MonsterEntity, Projectile, StatusId, Vec } from '../types/arpg.js';
import type { ManaType } from '../types/mana.js';
import { hitMonster, type SimCtx } from './combat.js';
import { angleBetween, dirTo, dist } from './geometry.js';
import { startPush } from './action.js';
import { defendingAbility } from './abilities/defend.js';
import { alive, nearestMonster, spawnProjectile } from './abilities/targeting.js';

/**
 * The basic attack: each blow of the weapon's string has a startup (a
 * committed melee blow lunges in), a strike, and a recovery that slows
 * movement. See the combat weight spec.
 */

const BASIC_STATUS: Record<ManaType, StatusId> = {
  fire: 'burn',
  frost: 'chill',
  storm: 'shock',
  earth: 'stagger',
  shadow: 'hex',
  nature: 'poison',
};
const BASIC_STATUS_CHANCE = 0.3;

function haste(ctx: SimCtx): number {
  const surge = ctx.world.hero.defend?.form === 'surge' ? defendingAbility(ctx) : null;
  return surge ? 1 + surge.effect : 1;
}

/** The nearest foe within `range` inside the arc around `dir` (where a manual lunge stops). */
function foeAhead(ctx: SimCtx, dir: Vec, range: number, arcDeg: number): MonsterEntity | null {
  const h = ctx.world.hero;
  const half = (arcDeg * Math.PI) / 360;
  let best: MonsterEntity | null = null;
  let bestD = Infinity;
  for (const m of alive(ctx)) {
    const d = dist(h.x, h.y, m.x, m.y) - m.radius;
    if (d > range || d >= bestD) continue;
    if (arcDeg < 360 && angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) > half) continue;
    best = m;
    bestD = d;
  }
  return best;
}

/**
 * Start the next blow of the string when the weapon is ready. Automatic
 * (`aim` undefined): only at a foe in reach, committing only while the hero
 * stands still. Manual: toward `aim` if given, else the nearest foe in reach,
 * else straight ahead; always committed. Returns whether a swing started.
 */
export function startSwing(ctx: SimCtx, aim: Vec | null | undefined, standing: boolean): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  if (t < h.nextAttackAt) return false;
  const w = h.stats.weapon;
  const manual = aim !== undefined;
  const committed = manual || standing;
  if (t - h.lastBasicAt > h.stats.attackInterval + bal.hero.basicComboGrace) h.attackCount = 0;
  const step = h.attackCount % w.combo.length;
  const s = w.combo[step];
  const melee = w.kind === 'melee';
  const lunge = melee && committed ? Math.max(0, s.move) : 0;
  const reach = w.range + (melee ? (s.reach ?? 0) : 0);
  const acquire = (committed ? reach + lunge : w.range) + (manual ? 1 : 0);
  const target = aim ? null : nearestMonster(ctx, h.x, h.y, acquire);
  if (!target && !manual) return false;

  let dir = aim
    ? dirTo(h.x, h.y, aim.x, aim.y)
    : target
      ? dirTo(h.x, h.y, target.x, target.y)
      : { ...h.facing };
  if (dir.x === 0 && dir.y === 0) dir = { ...h.facing };
  if (committed || !h.moving) h.facing = dir;
  const cycle = (h.stats.attackInterval * s.time) / haste(ctx);
  const startup = cycle * s.startup;
  h.swing = { step, dir, targetId: target?.id ?? null, start: t, strikeAt: t + startup, committed };
  h.nextAttackAt = t + cycle;
  h.recoverUntil = t;
  h.push = null;
  if (lunge > 0) {
    const foe = target ?? foeAhead(ctx, dir, reach + lunge, melee ? (s.arc ?? w.arc) : 360);
    startPush(ctx, dir, lunge, startup, foe?.id ?? null);
  }
  return true;
}

/** Land the swing's blow from where the hero stands now. */
export function strike(ctx: SimCtx): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const sw = h.swing;
  if (!sw) return;
  h.swing = null;
  h.push = null;
  const w = h.stats.weapon;
  const s = w.combo[sw.step];
  const last = sw.step === w.combo.length - 1;
  h.attackCount++;
  h.lastBasicAt = world.t;

  const surge = h.defend?.form === 'surge' ? defendingAbility(ctx) : null;
  const unit = h.stats.weaponDamage * h.stats.damageMult;
  const base = unit * s.power;
  const twinPct = (h.stats.legendaries.twin_fang ?? 0) / 100;
  const twin = twinPct > 0 && last;
  const element = w.element;
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (element) {
    const chance = element === 'earth' ? BASIC_STATUS_CHANCE * 0.6 : BASIC_STATUS_CHANCE;
    const status = BASIC_STATUS[element];
    if (!applies.includes(status) && world.rng.next() < chance) applies.push(status);
  }
  if (s.stagger && !applies.includes('stagger')) applies.push('stagger');
  const dir = sw.dir;

  // Mana only for an attack at something: a blow that connects, or a shot with a foe in range.
  let landed = w.kind !== 'melee' && !!nearestMonster(ctx, h.x, h.y, w.range);
  if (w.kind === 'melee') {
    const crit = world.rng.next() < h.stats.critChance;
    const arc = s.arc ?? w.arc;
    const reach = w.range + (s.reach ?? 0);
    const halfArc = (arc * Math.PI) / 360;
    const kb = s.knockback ? { knockback: s.knockback, kbFrom: { x: h.x, y: h.y } } : {};
    for (const m of alive(ctx)) {
      if (dist(h.x, h.y, m.x, m.y) - m.radius > reach) continue;
      if (
        arc < 360 &&
        m.id !== sw.targetId &&
        angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) > halfArc
      )
        continue;
      landed = true;
      hitMonster(ctx, m, base, element, { source: 'basic', crit, applies, heft: s.heft, ...kb });
      // Twin Fang: today's finisher value (×1.5) on melee.
      if (twin)
        hitMonster(ctx, m, unit * 1.5 * twinPct, element, { source: 'basic', crit, heft: s.heft });
    }
  } else {
    const size = s.size ?? 1;
    const speed = w.speed * (s.speed ?? 1);
    for (let i = 0; i < (twin ? 2 : 1); i++) {
      const spread = i === 0 ? 0 : 0.12;
      const d = {
        x: dir.x * Math.cos(spread) - dir.y * Math.sin(spread),
        y: dir.x * Math.sin(spread) + dir.y * Math.cos(spread),
      };
      spawnProjectile(ctx, {
        owner: 'hero',
        form: null,
        ability: null,
        homingId: null,
        x: h.x + d.x * 0.5,
        y: h.y + d.y * 0.5,
        vx: d.x * speed,
        vy: d.y * speed,
        radius: 0.3 * size,
        // Twin Fang's extra shot: today's value (×1.0) and never an explosion.
        damage: i === 0 ? base : unit * twinPct,
        element,
        pierce: w.pierce,
        maxDist: w.range + 1.5,
        explodeRadius: i === 0 ? (s.explode ?? 0) : 0,
        applies,
        knockback: 0,
        heft: s.heft,
      });
    }
    if (sw.committed && s.move < 0)
      startPush(ctx, { x: -dir.x, y: -dir.y }, -s.move, bal.feel.recoilSeconds);
  }

  const tgt =
    sw.targetId !== null ? world.monsters.find((m) => m.id === sw.targetId && !m.dead) : null;
  ctx.events.push({
    kind: 'basic',
    x: h.x,
    y: h.y,
    tx: tgt ? tgt.x : h.x + dir.x * w.range,
    ty: tgt ? tgt.y : h.y + dir.y * w.range,
    element,
    melee: w.kind === 'melee',
    heft: s.heft,
    step: sw.step,
    dir,
    finisher: last,
  });
  if (landed) h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
  if (sw.committed)
    h.recoverUntil = Math.min(
      h.nextAttackAt,
      world.t + (h.nextAttackAt - sw.start) * bal.feel.basicRecovery,
    );
}

/** A basic shot with an explosion bursts over every foe around it (each once). */
export function burstShot(ctx: SimCtx, p: Projectile): void {
  p.dead = true;
  ctx.events.push({ kind: 'explode', x: p.x, y: p.y, radius: p.explodeRadius, element: p.element });
  for (const m of alive(ctx)) {
    if (dist(p.x, p.y, m.x, m.y) > p.explodeRadius + m.radius) continue;
    hitMonster(ctx, m, p.damage, p.element, {
      source: 'basic',
      canCrit: true,
      applies: p.applies,
      heft: p.heft ?? 0,
    });
  }
}
```

- [ ] **Step 4: Rewire `heroTick`**

In `src/arpg/step.ts`: delete `basicAttack`, `BASIC_STATUS` and `BASIC_STATUS_CHANCE` (keep `ITEM_PICKUP_DELAY`), import `{ burstShot, startSwing, strike }` from `./basic.js` and `{ pushTick }` from `./action.js`, and replace the body of `heroTick` from the dodge onward with:

```ts
  // The dash moves first; presses made during it wait for it to end.
  dodgeTick(ctx, dt);
  if (world.queuedDodge && !isDashing(ctx)) {
    world.queuedDodge = false;
    tryDodge(ctx, move);
  }
  const dashing = isDashing(ctx);
  const t = world.t;
  // A queued press waits out a wind-up or a dash; anything else lets it through.
  if (world.queuedCast !== null && t > world.queuedCastUntil) world.queuedCast = null;
  if (world.queuedCast !== null && !dashing && !h.windup) {
    const cast = world.queuedCast;
    world.queuedCast = null;
    castAbility(ctx, cast);
  }
  castTick(ctx);

  // Movement: a push carries the hero; a wind-up or a committed swing roots it; a recovery slows it.
  const surge = h.defend?.form === 'surge' ? defendingAbility(ctx) : null;
  const pushed = !dashing && pushTick(ctx);
  const rooted = !!h.windup || !!h.swing?.committed;
  const v = clampLen(move);
  const speed = Math.hypot(v.x, v.y);
  h.moving = speed > 0.05 && !dashing && !pushed && !rooted;
  if (h.moving) {
    const slow = t < h.recoverUntil ? bal.feel.recoveryMove : 1;
    const pace = h.stats.moveSpeed * (surge ? 1 + bal.abilities.defend.surgeMove : 1) * slow;
    h.x = clamp(h.x + v.x * pace * dt, h.radius, world.width - h.radius);
    h.y = clamp(h.y + v.y * pace * dt, h.radius, world.height - h.radius);
    h.facing = { x: v.x / speed, y: v.y / speed };
  }

  if (h.swing && t >= h.swing.strikeAt - 1e-9) strike(ctx);
  if (!h.swing && !h.windup && !dashing) {
    // Automatic unless the input says whether the attack is held (manual mode).
    if (input.attack === undefined) startSwing(ctx, undefined, speed <= 0.05);
    else {
      const tap = world.queuedAttack && t <= world.queuedAttack.until ? world.queuedAttack : null;
      if ((input.attack || tap) && startSwing(ctx, input.attackAim ?? tap?.aim ?? null, true))
        world.queuedAttack = null;
    }
  }
  if (world.queuedAttack && t > world.queuedAttack.until) world.queuedAttack = null;
```

Keep the lines after it (mana regen, lull charge, `defendTick`) unchanged. Remove the imports that become unused. `tsc` names them (`noUnusedLocals`); expect `alive`, `angleBetween`, `StatusId` and `ManaType`.

In `projectilesTick`, hero branch, replace the hit handling with:

```ts
      p.hitIds.push(m.id);
      if (p.ability)
        impact(ctx, p.ability, p.x, p.y, p.explodeRadius, p.damage, {
          from,
          tick: p.form === 'ember',
          heft: p.heft,
        });
      else if (p.explodeRadius > 0) {
        burstShot(ctx, p);
        break;
      } else
        hitMonster(ctx, m, p.damage, p.element, {
          source: 'basic',
          canCrit: true,
          applies: p.applies,
          heft: p.heft ?? 0,
        });
      if (!p.pierce) p.dead = true;
```

and in the end-of-flight block, after the ability burst, add `else if (!p.ability && p.explodeRadius > 0) burstShot(ctx, p);` (restructure as `if (p.ability && …) impact(…) else if (…) burstShot(ctx, p);`, keeping `p.dead = true` first). `ImpactOpts.heft` doesn't exist until Task 7: add it now to `ImpactOpts` in `impact.ts` as `/** How hard direct hits land (defaults to the ability's). */ heft?: number;` (it is read in Task 7).

- [ ] **Step 5: The dodge cancels the swing**

In `src/arpg/dodge.ts`, import `cancelSwing` from `./action.js`, and in `tryDodge` just before `// Bailing out of a wind-up…` add:

```ts
  // A dodge drops a swing still winding up, and any push or recovery.
  cancelSwing(ctx);
  h.push = null;
  h.recoverUntil = t;
```

- [ ] **Step 6: Run the new tests**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts`
Expected: PASS. If one fails, print the relevant state (`w.t`, `w.hero.swing`, `w.hero.push`, positions) from the test before changing code. Don't guess.

- [ ] **Step 7: Update the manual-attack tests**

In `tests/delve-manual-attack.test.ts`, blows now land at the strike:
- "a tap between frames still swings once": collect the tap step's events plus `hold(w, 1, false)` and expect exactly 1 `basic` in total.
- "aimed…" and "a whiff…": hold for `0.3` s instead of `0.1` (the sword's startup is about 0.22 s).
- "resets after a pause…": after the pause, `hold(w, STEP, true)` starts a swing; expect `w.hero.swing!.step` to be 0 (the count resets at the swing's start and only grows at the strike).

Run: `cd packages/engine && npx vitest run tests/delve-manual-attack.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): basic attacks swing weapon strings with startup, strike and recovery"
```

### Task 5: Engine suite green after the basic-attack change

**Files:** existing engine tests only (plus any engine source the failures point to).

- [ ] **Step 1: Run the whole engine suite and typecheck**

Run: `cd packages/engine && npx vitest run 2>&1 | tail -40 && npx tsc --noEmit -p .`

- [ ] **Step 2: Fix each failure at its root**

For each failing test, decide whether it encodes an old rule the spec replaces or a real regression:
- **An old rule.** The test expects a `basic` event or damage on the step an attack starts, "every third melee swing is a finisher" (`ability-cast.test.ts`), or instant hits in `arpg-sim.test.ts`. Update the test to step past the startup, or rewrite it as a string test. Keep what it protects (for example the finisher test becomes "the sword's third blow is its finisher, with more power than the first").
- **A regression.** Fix the engine and add the missing test to `delve-combat-weight.test.ts`.

Don't touch `tests/delve-pacing.test.ts` bands here. If pacing fails, note the numbers and move on: Task 10 re-tunes after the ability changes land.

Leave `ability-cast.test.ts` "roots the hero through the wind-up, lands after it and blocks other casts" to Task 6 if it fails here. A Q pressed during a wind-up is now buffered and fires after it lands, and Task 6 rewrites that assertion. Also expect that until Task 6, a cast pressed during a swing's startup leaves both a wind-up and the swing; Task 6 makes the cast cancel the swing.

- [ ] **Step 3: Commit**

```bash
git add packages/engine
git commit -m "test(engine): step past the swing startup where blows used to land at once"
```

---

## Chunk 3: Abilities (conjure, motion, heavy payoff, thrown Burst)

### Task 6: Casting with a conjure, step-in, recoil and recovery

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`windup` fields), `src/arpg/abilities/cast.ts`, `src/arpg/dodge.ts`, `tests/fixtures/arena.ts`
- Test: `packages/engine/tests/delve-combat-weight.test.ts`; update `tests/ability-cast.test.ts`, `tests/delve-dodge.test.ts`

- [ ] **Step 1: Every ability winds up, and the fixture's press helper splits**

In `resolve.ts`, change `castTime: channel,` to `castTime: conjure + channel,`, and change the `castTime` doc in `ResolvedAbility` to `/** Wind-up seconds: conjure + channel. */`. In `ability-resolve.test.ts`, expectations of `castTime` for mana, charge or cast payment (around lines 27, 70 and 71) move to `channel`; `castTime` is now `conjure + channel`. In `hero-stats.ts` `useInterval`, replace `ab.cooldown + ab.castTime` with `ab.cooldown + ab.channel` (the conjure overlaps the cooldown).

In `tests/fixtures/arena.ts`, rename the current `press` to `pressOnly` (doc: `/** Press an ability and advance one step (its wind-up is still in progress). */`) and add:

```ts
/** Press an ability and run until its wind-up lands, returning every event. */
export function press(w: ArpgWorld, slot: number, aim?: { x: number; y: number }): ArpgEvent[] {
  const events = pressOnly(w, slot, aim);
  for (let i = 0; i < 300 && w.hero.windup; i++)
    events.push(...stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP));
  return events;
}
```

Update these existing tests:
- `delve-dodge.test.ts`:
  - "cancels a cast wind-up" → `pressOnly`;
  - "holds a cast pressed mid-dash" → `pressOnly`, and lengthen its `run(...)` by the ability's `castTime`.
- `ability-cast.test.ts`:
  - "roots the hero through the wind-up, lands after it and blocks other casts" → `pressOnly`. The Q pressed during the wind-up is now buffered and fires after the Nova, with its own 0.14 s conjure: extend the final run to `run(w, castTime + 0.3)` and, instead of `expect(w.hero.windup).toBeNull()`, assert that the run's events include a `cast` for slot 0 after the Nova's.
  - "a cast-paid ability still lands where its target was…" → `pressOnly` (it checks the wind-up right after the press).
  - "spends mana and starts the cooldown": set `w.hero.manaRegen = 0` at the start, because `press()` now runs through the conjure and regen would shift the mana check.

Then run `cd packages/engine && npx vitest run` and move any other test that inspects a wind-up right after pressing to `pressOnly`.

- [ ] **Step 2: Write the failing tests**

Append (import `pressOnly`, `press` from the fixture):

```ts
describe('casting: conjure, motion, recovery', () => {
  it('every ability winds up for its conjure; cast payment adds its channel', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    pressOnly(w, 0);
    const wu = w.hero.windup!;
    expect(wu.until - wu.start).toBeCloseTo(w.hero.abilities[0].conjure, 5);
    const c = arena([dummy(13, 30)], { noBasic: true, primary: { payment: 'cast' } });
    pressOnly(c, 0);
    const ab = c.hero.abilities[0];
    expect(c.hero.windup!.until - c.hero.windup!.start).toBeCloseTo(ab.conjure + ab.channel, 5);
  });

  it('a held Balanced primary keeps its cadence (the conjure overlaps the cooldown)', () => {
    const w = arena([dummy(13, 30, { hp: 1e9, maxHp: 1e9 })], { noBasic: true });
    w.hero.mana = w.hero.manaMax = 1e6;
    let casts = 0;
    for (let i = 0; i < Math.round(2 / STEP); i++)
      casts += stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP).filter(
        (e) => e.kind === 'cast',
      ).length;
    expect(casts).toBe(Math.floor(2 / w.hero.abilities[0].cooldown));
  });

  it('the press-combo step is chosen at the press', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    w.hero.mana = w.hero.manaMax = 1e6;
    press(w, 0);
    run(w, w.hero.abilities[0].cooldown);
    pressOnly(w, 0);
    expect(w.hero.windup!.step).toBe(1);
  });

  it('a bolt recoils the hero after its release', () => {
    const w = arena([dummy(13, 28)], { noBasic: true });
    const y0 = w.hero.y;
    press(w, 0);
    run(w, bal.feel.recoilSeconds + STEP);
    const bolt = w.hero.abilities[0];
    expect(w.hero.y - y0).toBeCloseTo(-bolt.motion * bolt.combo[0], 2);
  });

  it('a strike steps in over its conjure and hits from there', () => {
    const w = arena([dummy(13, 0)], { noBasic: true, primary: { form: 'strike' } });
    const ab = w.hero.abilities[0];
    place(w, ab.radius - w.hero.radius + 0.3);
    const y0 = w.hero.y;
    press(w, 0, { x: 13, y: 20 });
    expect(y0 - w.hero.y).toBeGreaterThan(0.3);
    expect(damaged(w.monsters[0])).toBe(true);
  });

  it('recovery follows an ability, except the Defensive', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    press(w, 0);
    expect(w.hero.recoverUntil).toBeGreaterThan(w.t);
    const d = arena([dummy(13, 30)], { noBasic: true });
    press(d, 1);
    expect(d.hero.recoverUntil).toBeLessThanOrEqual(d.t);
  });

  it('a press cancels a swing startup only when the cast goes ahead', () => {
    const w = arena([dummy(13, 0)], { primary: { form: 'strike' } });
    place(w, 1.0);
    run(w, STEP);
    expect(w.hero.swing).not.toBeNull();
    w.hero.cooldowns[0] = w.t + 5;
    pressOnly(w, 0);
    expect(w.hero.swing).not.toBeNull();
    w.hero.cooldowns[0] = 0;
    pressOnly(w, 0, { x: 13, y: 20 });
    expect(w.hero.swing).toBeNull();
    expect(w.hero.windup).not.toBeNull();
    // Its own step-in survives the cancel.
    expect(w.hero.push).not.toBeNull();
  });

  it('a dodge out of a wind-up refunds charge; mana stays spent', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    const ult = w.hero.abilities[2];
    w.hero.charge[2] = ult.chargeNeed;
    pressOnly(w, 2);
    expect(w.hero.charge[2]).toBe(0);
    dodge(w, { x: 1, y: 0 });
    expect(w.hero.charge[2]).toBeCloseTo(ult.chargeNeed);
    const m = arena([dummy(13, 30)], { noBasic: true });
    const mana = m.hero.mana;
    pressOnly(m, 0);
    dodge(m, { x: 1, y: 0 });
    expect(m.hero.mana).toBeLessThan(mana - m.hero.abilities[0].cost + 1);
  });

  it('a press during a wind-up fires when it lands; a stale press is dropped', () => {
    const w = arena([dummy(13, 30)], { noBasic: true, ultimate: { payment: 'cast' } });
    pressOnly(w, 2);
    stepWorld(registry, w, { move: still, cast: { slot: 0 } }, STEP);
    const events = run(w, w.hero.abilities[2].castTime + 0.3);
    expect(events.some((e) => e.kind === 'cast' && e.slot === 0)).toBe(true);
    const s = arena([dummy(13, 30)], { noBasic: true });
    s.queuedCast = { slot: 0 };
    s.queuedCastUntil = s.t - 1;
    expect(run(s, 0.5).some((e) => e.kind === 'cast')).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts`
Expected: FAIL (`windup.step` undefined, no recoil, etc.).

- [ ] **Step 4: Add the wind-up fields**

In `HeroEntity.windup` (`types/arpg.ts`), change its doc to `/** An ability winding up (every ability conjures; cast payment channels too); the hero can't move or attack meanwhile. */` and add:

```ts
    /** The press-combo step, chosen at the press. */
    step: number;
    /** When the conjure ends (any channel follows). */
    conjureUntil: number;
    /** Charge spent at the press (refunded if a dodge cancels). */
    chargePaid: number;
```

- [ ] **Step 5: Rewrite `cast.ts`**

Replace `fire`, `castAbility` and `castTick` (keep `abilityReady` and `pay`):

```ts
import type { AbilityCast } from '../../types/ability.js';
import type { Vec } from '../../types/arpg.js';
import type { SimCtx } from '../combat.js';
import { cancelSwing, pushTick, startPush } from '../action.js';
import { dirTo } from '../geometry.js';
import { executeForm } from './forms.js';
import { stepHeft } from './resolve.js';
import { aimPoint, nearestMonster } from './targeting.js';

/** Fire the slot's form now at press-combo `step`, then its recoil and recovery. */
function fire(ctx: SimCtx, slot: number, aim: Vec | null, step: number): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const ab = h.abilities[slot];
  const res = executeForm(ctx, ab, aim, step);
  if (!res.ok) return false;
  h.comboStep[slot] = step;
  h.comboAt[slot] = world.t;
  ctx.events.push({
    kind: 'cast',
    slot,
    name: ab.name,
    form: ab.form.id,
    element: ab.element,
    x: h.x,
    y: h.y,
    tx: res.tx,
    ty: res.ty,
    heft: stepHeft(ab, step),
  });
  if (ab.motion < 0) {
    const d = dirTo(h.x, h.y, res.tx, res.ty);
    const mult = ab.combo[step % ab.combo.length];
    if (d.x !== 0 || d.y !== 0)
      startPush(ctx, { x: -d.x, y: -d.y }, -ab.motion * mult, bal.feel.recoilSeconds);
  }
  if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;
  return true;
}

/**
 * Use an ability. Fails, costing nothing, while another is winding up, on
 * cooldown, uncharged, unaffordable (with a `noMana` event) or with nothing
 * to aim at. Otherwise it pays now, drops a basic swing still winding up,
 * and winds up for its conjure (stepping in, for forward forms) plus any
 * channel; the cooldown counts from the press plus the channel.
 */
export function castAbility(ctx: SimCtx, cast: AbilityCast): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const t = world.t;
  const slot = cast.slot;
  const ab = h.abilities[slot];
  if (!ab || h.windup || t < h.cooldowns[slot]) return false;
  if (ab.build.payment === 'charge' && h.charge[slot] < ab.chargeNeed - 1e-9) return false;
  if (h.mana < ab.cost) {
    ctx.events.push({ kind: 'noMana', slot });
    return false;
  }
  const aim = cast.aim ?? null;
  const at = aimPoint(ctx, ab, aim);
  if (!at) return false;

  // It goes ahead: a swing still winding up gives way first, so the step-in below survives.
  cancelSwing(ctx);
  h.push = null;
  h.recoverUntil = t;
  const step =
    t - h.comboAt[slot] <= bal.abilities.comboWindow
      ? (h.comboStep[slot] + 1) % ab.combo.length
      : 0;
  const chargePaid = ab.build.payment === 'charge' ? h.charge[slot] : 0;
  pay(ctx, slot, t + ab.channel);
  const dir = dirTo(h.x, h.y, at.x, at.y);
  if (dir.x !== 0 || dir.y !== 0) h.facing = dir;
  h.windup = {
    slot,
    aim,
    at,
    start: t,
    until: t + ab.castTime,
    step,
    conjureUntil: t + ab.conjure,
    chargePaid,
  };
  if (ab.motion > 0 && (dir.x !== 0 || dir.y !== 0)) {
    const stop = nearestMonster(ctx, at.x, at.y, 1.5);
    startPush(ctx, dir, ab.motion * ab.combo[step % ab.combo.length], ab.conjure, stop?.id ?? null);
  }
  ctx.events.push({ kind: 'windup', slot, until: h.windup.until, heft: stepHeft(ab, step) });
  return true;
}

/**
 * Land a finished wind-up at its press-time combo step. Auto-aim is chosen
 * again now; if nothing is left to aim at, it lands where the press aimed.
 */
export function castTick(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.windup || ctx.world.t < h.windup.until - 1e-9) return;
  const { slot, aim, at, step } = h.windup;
  h.windup = null;
  // A step-in finishes before the blow lands, so it hits from where the step took the hero.
  pushTick(ctx, true);
  if (!fire(ctx, slot, aim, step)) fire(ctx, slot, at, step);
}
```

In `src/arpg/dodge.ts`, change the wind-up bail-out to refund charge:

```ts
  // Bailing out of a wind-up keeps the mana spent but frees the ability again (and refunds charge).
  if (h.windup) {
    h.cooldowns[h.windup.slot] = t;
    h.charge[h.windup.slot] += h.windup.chargePaid;
    h.windup = null;
  }
```

- [ ] **Step 6: Run the tests**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts tests/ability-cast.test.ts tests/delve-dodge.test.ts tests/ability-resolve.test.ts`
Expected: PASS. "Every ability winds up for its conjure" and "a press during a wind-up fires when it lands; a stale press is dropped" are guard tests: parts of them already pass after Steps 1 and Task 3–4. If "a held Balanced primary keeps its cadence" is off by one, check the cadence first. A frame-quantisation drift is acceptable: assert `toBeGreaterThanOrEqual(floor(2 / cooldown) - 1)`. Don't loosen further without data.

- [ ] **Step 7: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): abilities conjure, step in or recoil, and recover by weight"
```

### Task 7: Heavy payoff and heft on direct hits only

**Files:**
- Modify: `packages/engine/src/arpg/abilities/impact.ts`, `src/arpg/abilities/forms.ts`, `src/arpg/step.ts` (`zonesTick` heft)
- Test: `packages/engine/tests/delve-combat-weight.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('heavy payoff and heft', () => {
  it('a Crushing bolt knocks back and staggers; a Balanced one does not stagger', () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { weight: 2 } });
    const events = press(w, 0);
    events.push(...run(w, 1));
    expect(w.monsters[0].status.staggerUntil).toBeGreaterThan(0);
    const hit = events.find((e) => e.kind === 'hit' && e.id === w.monsters[0].id);
    expect(hit && hit.kind === 'hit' && hit.heft).toBeCloseTo(1);
    const b = arena([dummy(13, 30)], { noBasic: true });
    press(b, 0);
    run(b, 1);
    expect(b.monsters[0].status.staggerUntil).toBe(0);
  });

  it("a Crushing bolt's chain jump keeps no heavy payoff and no heft", () => {
    const w = arena([dummy(13, 30), dummy(15, 30)], {
      noBasic: true,
      primary: { elements: ['storm'], weight: 2 },
    });
    const [first, second] = w.monsters;
    const events = press(w, 0, { x: 13, y: 30 });
    events.push(...run(w, 1));
    const chained = events.filter((e) => e.kind === 'hit' && e.id === second.id);
    expect(chained.length).toBeGreaterThan(0);
    expect(chained.every((e) => e.kind === 'hit' && e.heft === 0)).toBe(true);
    expect(second.status.staggerUntil).toBe(0);
    expect(first.status.staggerUntil).toBeGreaterThan(0);
  });

  it('Crushing adds knockback to a direct hit', () => {
    const heavy = arena([dummy(13, 30)], { noBasic: true, primary: { weight: 2 } });
    const light = arena([dummy(13, 30)], { noBasic: true });
    for (const w of [heavy, light]) {
      press(w, 0);
      until(w, () => damaged(w.monsters[0]));
    }
    const kb = (w: ArpgWorld) => Math.hypot(w.monsters[0].kbx, w.monsters[0].kby);
    expect(kb(heavy)).toBeGreaterThan(kb(light));
  });

  it("a Crushing Maelstrom's ticks and a Crushing Surge's basic hits never stagger (guard test)", () => {
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      ultimate: { form: 'maelstrom', weight: 2, payment: 'mana' },
    });
    w.hero.mana = w.hero.manaMax = 1e6;
    const events = press(w, 2, { x: 13, y: 30 });
    events.push(...run(w, 2));
    expect(w.monsters[0].status.staggerUntil).toBe(0);
    expect(events.filter((e) => e.kind === 'hit').every((e) => e.kind === 'hit' && e.heft === 0)).toBe(true);

    const s = arena([dummy(13, 0)], { defensive: { form: 'surge', weight: 2 } });
    place(s, 0.6);
    press(s, 1);
    until(s, () => s.hero.attackCount >= 2);
    expect(s.monsters[0].status.staggerUntil).toBe(0);
  });
});
```

The Surge case assumes the sword's first two blows don't stagger (they don't; only the maul's slam has `stagger`) and that the fire weapon's basic status isn't `stagger`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts`
Expected: FAIL (no stagger, heft 0).

- [ ] **Step 3: `hitOpts` gains `direct`, the heavy payoff and heft**

In `impact.ts`:

```ts
/**
 * How an ability's knobs shape each of its hits. `tick` hits (zone ticks,
 * embers) can't crit or knock back; only `direct` hits (the ability landing,
 * not chain jumps or ticks) get the weight's heavy payoff and carry heft.
 */
export function hitOpts(
  ab: ResolvedAbility,
  from: Vec,
  tick = false,
  direct = !tick,
  heft = ab.heft,
): HitOpts {
  const k = ab.knobs;
  const stagger = direct && ab.heavyStagger && !k.applies.includes('stagger');
  return {
    source: 'skill',
    canCrit: !tick,
    applies: stagger ? [...k.applies, 'stagger'] : k.applies,
    knockback: tick ? 0 : k.knockback + (direct ? ab.heavyKnockback : 0),
    kbFrom: from,
    leech: k.lifesteal,
    execute: k.execute,
    spread: k.spread,
    slot: slotIndex(ab),
    heft: direct ? heft : 0,
  };
}
```

In `chainFrom`: `hitMonster(ctx, next, amount, ab.element, hitOpts(ab, current, tick, false));`
In `impact`: `const opts = hitOpts(ab, o.from ?? { x, y }, o.tick, !o.tick, o.heft ?? ab.heft);`

- [ ] **Step 4: Forms pass the press's heft**

In `forms.ts`, import `stepHeft` from `./resolve.js` and, after `const hit = …`, add `const heft = stepHeft(ab, step);`. Then:
- `bolt` and `volley`: add `heft,` to `spawnProjectile({...})`.
- `lance`: `const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);`
- `strike`: the same with `{ x: h.x, y: h.y }`.
- `blink`: `const opts = hitOpts(ab, { x: fromX, y: fromY }, false, true, heft);`
- `nova`: `impact(ctx, ab, h.x, h.y, ab.radius, hit, { noScatter: true, heft });`
- `barrage`: add `heft: heft * 0.5,` to each zone.

In `step.ts` `zonesTick`, the barrage/burst landing: `if (z.ability) impact(ctx, z.ability, z.x, z.y, z.radius, z.damage, { heft: z.heft });`. In `projectilesTick`, the end-of-flight ability burst also passes `heft: p.heft`, so a 4th-press bolt that lands on the ground is as heavy as one that hits.

- [ ] **Step 5: Run the tests**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts tests/ability-forms.test.ts tests/ability-status.test.ts`
Expected: PASS (update any ability test that asserted exact knockback on a Heavy/Crushing build).

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): heavy abilities knock back and stagger on direct hits, with heft"
```

### Task 8: Burst is thrown

**Files:**
- Modify: `packages/engine/src/arpg/abilities/forms.ts`
- Test: `packages/engine/tests/delve-combat-weight.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('Burst is thrown', () => {
  it('nothing lands until the lob arrives, then it explodes at the aim point', () => {
    const w = arena([dummy(13, 29)], { noBasic: true, primary: { form: 'burst' } });
    press(w, 0, { x: 13, y: 29 });
    const z = w.zones.find((q) => q.source === 'burst')!;
    expect(z).toBeDefined();
    expect(z.fromX).toBeCloseTo(w.hero.x, 1);
    expect(z.detonateAt).toBeGreaterThan(w.t + bal.feel.lobBase - 1e-9);
    expect(damaged(w.monsters[0])).toBe(false);
    const events = until(w, () => damaged(w.monsters[0]));
    const boom = events.find((e) => e.kind === 'explode');
    expect(boom && boom.kind === 'explode' && Math.hypot(boom.x - 13, boom.y - 29)).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts`
Expected: FAIL (Burst explodes on release).

- [ ] **Step 3: Implement**

In `forms.ts`, replace `case 'burst':`:

```ts
    case 'burst': {
      // Thrown: the mana arcs to the aim point and bursts where it lands.
      h.facing = dir;
      const land = t + ctx.bal.feel.lobBase + dist(h.x, h.y, p.x, p.y) / Math.max(1, ab.speed);
      world.zones.push({
        id: world.nextId++,
        owner: 'hero',
        source: 'burst',
        ability: ab,
        x: p.x,
        y: p.y,
        radius: ab.radius * mult,
        born: t,
        until: land + 0.1,
        tick: 0,
        nextTick: 0,
        damage: hit,
        element: ab.element,
        applies: ab.knobs.applies,
        detonateAt: land,
        dead: false,
        fromX: h.x,
        fromY: h.y,
        heft,
      });
      return done(p.x, p.y);
    }
```

Update the `Zone.detonateAt` doc to mention Burst: `/** Telegraph / Barrage impact / thrown Burst: explodes at this time (0 = lingering zone). */`.

- [ ] **Step 4: Run the tests**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts tests/ability-forms.test.ts tests/ability-cast.test.ts`
Expected: new test PASS. Update Burst tests in `ability-forms.test.ts` that expect damage right after `press` so they run until the lob lands (`run(w, 1)`).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): Burst is thrown and bursts where it lands"
```

### Task 9: Engine suite green after the ability changes

- [ ] **Step 1: Run everything**

Run: `cd packages/engine && npx vitest run 2>&1 | tail -40 && npx tsc --noEmit -p .`

- [ ] **Step 2: Fix failures at their root**

Use the Task 5 rule: update tests that encode instant casts (`arpg-sim.test.ts` cast-tap tests, `ability-forms.test.ts`), and fix real regressions with a test. Pacing waits for Task 10.

- [ ] **Step 3: Commit**

```bash
git add packages/engine
git commit -m "test(engine): cast tests step past the conjure"
```

---

## Chunk 4: Bot, estimates, pacing and the first release (v0.39.0)

### Task 10: Bot, Power estimate and pacing

**Files:**
- Modify: `packages/engine/src/arpg/bot.ts`, `src/delve/hero-stats.ts`
- Test: `packages/engine/tests/delve-pacing.test.ts` (run; bands unchanged), `tests/delve-combat-weight.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// (Add to the file's imports: `botInput` from '../src/arpg/bot.js', and `estimateCombat`
// merged into the existing '../src/delve/hero-stats.js' import.)

describe('bot and estimates', () => {
  it("the bot doesn't cancel its own swing with the Primary", () => {
    const w = arena([dummy(13, 0)]);
    place(w, 0.6);
    run(w, STEP);
    expect(w.hero.swing).not.toBeNull();
    // Only the Primary is ready, so today's bot would press it and cancel the swing.
    w.hero.cooldowns[1] = w.hero.cooldowns[2] = 1e9;
    expect(botInput(registry, w).cast?.slot).toBeUndefined();
  });

  it('the Power estimate reads the weapon string', () => {
    const sword = computeHeroStats({ weapon: gear('fire', 'weapon', 'sword') }, registry);
    const maul = computeHeroStats({ weapon: gear('fire', 'weapon', 'maul') }, registry);
    const a = estimateCombat(sword, registry, 5);
    const b = estimateCombat({ ...sword, weapon: { ...sword.weapon, combo: maul.weapon.combo } }, registry, 5);
    expect(a.dps).not.toBeCloseTo(b.dps, 3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`bot.ts`, the Primary entry in `wants`:

```ts
    // Let a swing land: pressing the Primary now would cancel it.
    gap < h.abilities[0].range && !h.swing && abilityReady(ctx, 0) ? 0 : -1,
```

`hero-stats.ts` `estimateCombat`, replace the finisher and Twin Fang lines:

```ts
  const combo = stats.weapon.combo;
  const stringPower = combo.reduce((a, s) => a + s.power, 0);
  const stringTime = combo.reduce((a, s) => a + s.time, 0);
  const strikeInterval = (stats.attackInterval * stringTime) / combo.length;
  let dps = (hit * (1 + weaponElem) * cleave * (stringPower / stringTime)) / stats.attackInterval;
  // Twin Fang: one extra hit per string (×1.5 melee, ×1 ranged).
  if (L.twin_fang) dps *= 1 + ((L.twin_fang / 100) * (melee ? 1.5 : 1)) / stringPower;
```

and use `strikeInterval` instead of `stats.attackInterval` in `manaIncome`. (`useInterval` already uses `channel` since Task 6.)

- [ ] **Step 4: Run the tests and the pacing guard rails**

Run: `cd packages/engine && npx vitest run tests/delve-combat-weight.test.ts && npx vitest run tests/delve-pacing.test.ts`
Expected: the new tests PASS. If pacing fails, print `endDepthAt(1)` and `endDepthAt(12)` (add a temporary `console.log` in the test file, then remove it) and tune in the spec's order:
1. the weapon strings' `power` (keep them within ±10%);
2. the `feel` numbers;
3. monsters, only as a last resort.

Re-run until the bands hold, then record the before (Task 1 Step 0) and after depths in the commit body.

- [ ] **Step 5: Engine suite, build, commit**

Run: `cd packages/engine && npx vitest run && npx tsc --noEmit -p . && cd ../.. && pnpm -F @alloy/engine build`
Expected: all green.

```bash
git add packages/engine
git commit -m "feat(engine): the bot lets its swings land; Power reads the weapon string"
```

### Task 11: Client reads for the new engine

**Files:**
- Modify: `packages/client/src/features/gamepad/arena-pad.ts`, `features/delve/arena/useArena.ts`, `features/delve/arena/ArenaHud.tsx`, `features/delve/AbilitiesPanel.tsx`, `features/delve/PaperDoll.tsx`, `features/delve/arena/fx/draw-world.ts`, `features/delve/arena/fx/mana-fx.ts`, `features/delve/arena/fx/mana-pixels.ts`, `features/delve/arena/ArenaRenderer.ts`
- Modify: `features/delve/arena/pixel/floor-engine.ts` (skip thrown Bursts)
- Test: `features/delve/__tests__/ArenaHud.test.tsx`, `features/gamepad/__tests__/gamepad.test.ts`, `features/delve/arena/fx/__tests__/mana-pixels.test.ts`, `features/delve/__tests__/floor-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

In `ArenaHud.test.tsx`, add `basicComboLength: 3` to the HUD fixture, and add:

```tsx
  it('shows one pip per blow of the weapon string, for any weapon', () => {
    render(<AttackButton hud={hud({ basicComboLength: 2, melee: false })} onAttack={() => {}} />);
    expect(screen.getByTestId('attack-button').querySelectorAll('[data-combo]')).toHaveLength(2);
  });
```

(Adapt `hud(...)` and `render` to the file's existing helper names.)

In `features/gamepad/__tests__/gamepad.test.ts` (it already has `fakePad`, `readPad` and `edges`), add:

```ts
  it('reports a tap of the attack button on its press edge only', () => {
    const prev = readPad(fakePad());
    const next = readPad(fakePad([5]));
    expect(padToArena(next, edges(prev, next)).attackTap).toBe(true);
    expect(padToArena(next, edges(next, next)).attackTap).toBe(false);
  });
```

(Import `padToArena` from `../arena-pad` if the file doesn't already; RB is button 5 and the default attack binding.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/ArenaHud.test.tsx src/features/gamepad`
Expected: FAIL.

- [ ] **Step 3: Implement**

`arena-pad.ts`: add `/** The attack button pressed this frame (a tap the engine keeps briefly). */ attackTap: boolean;` to `ArenaPadActions`, and `attackTap: is(cfg.pad.attack, (b) => pressed.has(b)),` in `padToArena`.

`useArena.ts`:
- In the `ArenaHud` interface, add `basicComboLength: number;`.
- In the snapshot, add `basicComboLength: h.stats.weapon.combo.length,` and change `basicComboNext` to `… : h.attackCount % h.stats.weapon.combo.length`.
- Per ability:

```ts
        cooldownTotal: Math.max(0.01, ab.channel + ab.cooldown),
        // Only a channel shows: a conjure is anticipation in the arena, not a HUD bar.
        windup:
          h.windup?.slot === i && ab.channel > 0
            ? Math.min(
                1,
                Math.max(0, (t - h.windup.conjureUntil) / Math.max(0.01, h.windup.until - h.windup.conjureUntil)),
              )
            : null,
```

- `busy: !!h.windup && (h.abilities[h.windup.slot]?.channel ?? 0) > 0,`
- In the manual input object, add `attackTap: input.attackTap || !!pad?.attackTap,`.

`useArena.ts` `ArenaHud` interface: update the `basicComboNext` doc to "the blow of the weapon's string that lands next".

`pixel/floor-engine.ts`: the pixel floor paints every hero zone except Barrage each frame. Add `|| z.source === 'burst'` to that skip, or lava shows at a thrown Burst's target before it lands. In `__tests__/floor-engine.test.ts`, add `heft: 0` to the hand-built `hit` event.

`ArenaHud.tsx`:
- Update the `busy` prop's doc/comment to "an ability is channelling (presses wait for it)".
- In `AttackButton`, render the pips when `hud && hud.basicComboLength > 1` (drop the `melee` gate) with `Array.from({ length: hud.basicComboLength }, (_, k) => …)`.

`AbilitiesPanel.tsx`, the payment line:

```ts
  const windup = ab.castTime > 0 ? ` · ${ab.castTime.toFixed(2)}s wind-up` : '';
  const pay =
    ab.build.payment === 'charge'
      ? `Charge ${Math.round(ab.chargeNeed)}${windup}`
      : `${Math.round(ab.cost)} mana${windup}`;
```

`PaperDoll.tsx`:

```tsx
              sub={`${(
                stats.weapon.combo.length /
                (stats.attackInterval * stats.weapon.combo.reduce((a, s) => a + s.time, 0))
              ).toFixed(2)} atk/s`}
```

`draw-world.ts` `drawGuard`, the wind-up block: draw the ring and arc only for a channel.

```ts
  if (h.windup) {
    const ab = h.abilities[h.windup.slot];
    const color = ab ? MANA_HEX[ab.element] : 0xffffff;
    if (ab && ab.channel > 0 && w.t >= h.windup.conjureUntil) {
      const p = progress(w.t, h.windup.conjureUntil, h.windup.until);
      manaRing(air, h.x, cy, 1.2, color, time, { alpha: 0.35, gaps: 8, spin: 5 });
      manaArc(air, h.x, cy, 1.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p, color, 1, 2);
    }
    fx.gather(h.x, h.y, color);
  }
```

Remove the fake lunge. The engine moves the hero now, so:
- In `mana-fx.ts`, delete `LUNGE_SECONDS`, `lungeState`, `lunge()` and `lungeAt()`, the `lungeOffset` import, and the lunge reset in `clear()`.
- In `mana-pixels.ts`, delete `lungeOffset` and its test in `__tests__/mana-pixels.test.ts`.
- In `ArenaRenderer.ts`, delete every `this.fx.lunge(...)` call, and in `syncHero` replace the lunge lines with `s.position.set(0, 0.5);`.

In `ArenaRenderer.ts` `case 'basic'`, delete the old `const dir = { x: e.tx - e.x, y: e.ty - e.y };` line (the event carries `dir` now) and draw the swing with the blow's own arc and reach:

```ts
          if (e.melee) {
            const wpn = w.hero.stats.weapon;
            const s = wpn.combo[e.step] ?? wpn.combo[0];
            this.fx.swing(
              e.x,
              e.y,
              Math.atan2(e.dir.y, e.dir.x),
              Math.min(360, s.arc ?? wpn.arc) * (Math.PI / 180),
              wpn.range + (s.reach ?? 0) + 0.2,
              elemColor(e.element),
              0.16,
            );
          } else this.fx.fling(e.x, e.y, e.dir, elemColor(e.element), 6, 7);
```

- [ ] **Step 4: Run the client checks**

Run: `pnpm -F @alloy/engine build && cd packages/client && npx tsc --noEmit -p . && npx vitest run`
Expected: typecheck clean; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): read weapon strings, channel-only wind-ups and attack taps"
```

### Task 12: Verify end to end and ship v0.39.0

- [ ] **Step 1: Run the Delve E2E**

Restart the dev server on port 5288 after the engine build: stop it if it is running, then run `cd packages/client && npx vite --port 5288 --strictPort --force --host` in the background. Vite can serve a stale bundled engine otherwise. Write a scratch config `packages/client/playwright.scratch.config.ts` that reuses it:

```ts
import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  globalSetup: undefined,
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://localhost:5288' },
  webServer: { command: 'echo reuse', url: 'http://localhost:5288', reuseExistingServer: true },
  projects: (base.projects ?? []).filter((p) => p.name !== 'responsive'),
});
```

Run: `cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts`
Expected: all pass. A timeout under load that passes on rerun (`-g <test> --repeat-each 2`) is flakiness. A consistent failure is a regression: debug it with state logging and fix it. Delete the scratch config afterwards.

- [ ] **Step 2: Docs and version**

- `CLAUDE.md` Delve section:
  - Replace "and the melee 3-hit combo resets after a pause" with: "each weapon swings its own combo string (`delve.json` `combo`), and every attack and ability runs startup → strike → recovery: committed blows lunge in, shots and bolts recoil, weight sets an ability's conjure, and Burst is thrown (spec: `docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md`)".
  - Add `action.ts` (pushes, cancels) and `basic.ts` (swings) to the engine module list, and `delve.feel` to the Data line.
- Spec status: `**Status:** Engine built in v0.39.0; client feel pending.`
- `packages/client/package.json`: `"version": "0.39.0"`.

- [ ] **Step 3: Commit and push**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md packages/client/package.json
git commit -m "docs: combat weight in the Delve notes

chore(client): bump version to 0.39.0"
git push -q origin claude/alloy-loot-gear-system-6upsy5
```

---

## Chunk 5: Client feel (v0.40.0)

All of this is display-only. Nothing here may change the engine.

### Task 13: Hit-stop

**Files:**
- Create: `packages/client/src/features/delve/arena/fx/hitstop.ts`
- Modify: `packages/client/src/features/delve/arena/useArena.ts`
- Test: `packages/client/src/features/delve/arena/fx/__tests__/hitstop.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { ArpgEvent } from '@alloy/engine';
import { HITSTOP, HitStop, hitstopMs } from '../hitstop';

const hit = (heft: number, crit = false): ArpgEvent =>
  ({ kind: 'hit', id: 1, x: 0, y: 0, amount: 1, crit, element: null, heft }) as ArpgEvent;
const death = (monsterKind: 'normal' | 'elite' | 'boss'): ArpgEvent =>
  ({ kind: 'death', id: 1, x: 0, y: 0, monsterKind, scrap: 0 }) as ArpgEvent;

describe('hit-stop', () => {
  it('scales with the heaviest direct hit, ignores light ones, adds for crits and big kills', () => {
    expect(hitstopMs([hit(0.2)])).toBe(0);
    expect(hitstopMs([hit(0.5), hit(0.2)])).toBe(45);
    expect(hitstopMs([hit(0.5, true)])).toBe(65);
    expect(hitstopMs([death('normal')])).toBe(0);
    expect(hitstopMs([death('elite')])).toBe(HITSTOP.bigKillMs);
    expect(hitstopMs([hit(1, true), death('boss')])).toBe(HITSTOP.maxMs);
  });

  it('freezes, then waits a gap before the next freeze', () => {
    const s = new HitStop();
    s.onEvents([hit(1)], 1000);
    expect(s.frozen(1050)).toBe(true);
    expect(s.frozen(1100)).toBe(false);
    s.onEvents([hit(1)], 1150);
    expect(s.frozen(1160)).toBe(false);
    s.onEvents([hit(1)], 1000 + 90 + HITSTOP.gapMs + 1);
    expect(s.frozen(1000 + 90 + HITSTOP.gapMs + 10)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/hitstop.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `fx/hitstop.ts`**

```ts
import type { ArpgEvent } from '@alloy/engine';

/** Display-only freezes on heavy hits: the rules never pause, only the display clock. */
export const HITSTOP = {
  minHeft: 0.3,
  msPerHeft: 90,
  critMs: 20,
  bigKillMs: 120,
  maxMs: 120,
  /** A new freeze waits this long after the last one ended, so a flurry doesn't stutter. */
  gapMs: 150,
} as const;

/** How long this frame's events freeze the display, in ms (0 = no freeze). */
export function hitstopMs(events: readonly ArpgEvent[]): number {
  let ms = 0;
  for (const e of events) {
    if (e.kind === 'hit' && e.heft >= HITSTOP.minHeft)
      ms = Math.max(ms, HITSTOP.msPerHeft * e.heft + (e.crit ? HITSTOP.critMs : 0));
    else if (e.kind === 'death' && e.monsterKind !== 'normal') ms = Math.max(ms, HITSTOP.bigKillMs);
  }
  return Math.min(HITSTOP.maxMs, Math.round(ms));
}

/** The freeze in progress, with the gap between freezes. */
export class HitStop {
  private until = -Infinity;

  frozen(now: number): boolean {
    return now < this.until;
  }

  onEvents(events: readonly ArpgEvent[], now: number): void {
    if (now < this.until + HITSTOP.gapMs) return;
    const ms = hitstopMs(events);
    if (ms > 0) this.until = now + ms;
  }
}
```

- [ ] **Step 4: Gate the display clock**

In `useArena.ts`: import `{ HitStop }` from `./fx/hitstop` and add `const hitstopRef = useRef(new HitStop());`. In the ticker, replace the `slow`/`dt` lines with:

```ts
          const now = performance.now();
          // A hit-stop freezes the display (a dt of 0 runs no ticks; presses are still recorded).
          const scale = hitstopRef.current.frozen(now)
            ? 0
            : now < slowUntilRef.current
              ? SLOWMO_SCALE
              : 1;
          const dt = Math.min(0.1, ticker.deltaMS / 1000) * scale;
```

After `renderer.handleEvents(events);` add `if (!flags.autopilot) hitstopRef.current.onEvents(events, performance.now());` (the bot-driven E2E runs would otherwise spend a large share of wall time frozen).

- [ ] **Step 5: Run the tests**

Run: `cd packages/client && npx vitest run src/features/delve/arena`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/delve/arena
git commit -m "feat(client): hit-stop on heavy hits"
```

### Task 14: Camera kick and anticipation

**Files:**
- Create: `packages/client/src/features/delve/arena/fx/anticipation.ts`
- Modify: `features/delve/arena/ArenaRenderer.ts`, `features/delve/arena/fx/draw-world.ts`, `features/delve/arena/fx/mana-fx.ts` (`gather`)
- Test: `packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { ArpgWorld } from '@alloy/engine';
import { windingUp } from '../anticipation';

function world(over: Partial<ArpgWorld['hero']>): ArpgWorld {
  return {
    t: 1,
    hero: {
      x: 5,
      y: 5,
      swing: null,
      windup: null,
      abilities: [],
      stats: { weapon: { combo: [{ time: 1, startup: 0.3, move: 0.4, power: 1, heft: 0.8 }], element: 'fire' } },
      ...over,
    },
  } as unknown as ArpgWorld;
}

describe('windingUp', () => {
  it('reports a committed swing with its heft and progress', () => {
    const a = windingUp(
      world({ swing: { step: 0, dir: { x: 1, y: 0 }, targetId: null, start: 0.9, strikeAt: 1.1, committed: true } }),
    )!;
    expect(a.heft).toBeCloseTo(0.8);
    expect(a.progress).toBeCloseTo(0.5);
    expect(a.dir).toEqual({ x: 1, y: 0 });
  });

  it('reports a wind-up with the press heft, toward where it aims', () => {
    const a = windingUp(
      world({
        facing: { x: 0, y: -1 },
        abilities: [{ element: 'frost', heft: 0.45, combo: [1] }],
        windup: { slot: 0, aim: null, at: { x: 5, y: 9 }, start: 0.9, until: 1.3, step: 0, conjureUntil: 1.3, chargePaid: 0 },
      } as never),
    )!;
    expect(a.heft).toBeCloseTo(0.45);
    expect(a.dir).toEqual({ x: 0, y: 1 });
    expect(a.progress).toBeCloseTo(0.25);
  });

  it('ignores an uncommitted swing and idle heroes', () => {
    expect(
      windingUp(world({ swing: { step: 0, dir: { x: 1, y: 0 }, targetId: null, start: 0.9, strikeAt: 1.1, committed: false } })),
    ).toBeNull();
    expect(windingUp(world({}))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/anticipation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `fx/anticipation.ts`**

```ts
import { stepHeft, type ArpgWorld, type Vec } from '@alloy/engine';
import { MANA_HEX } from '../palette';

export interface WindingUp {
  /** Toward the target (unit vector). */
  dir: Vec;
  heft: number;
  /** 0 at the press, 1 at the strike or release. */
  progress: number;
  color: number;
}

/** The action the hero is winding up right now (a committed swing or an ability), or null. */
export function windingUp(w: ArpgWorld): WindingUp | null {
  const h = w.hero;
  if (h.swing?.committed) {
    const s = h.stats.weapon.combo[h.swing.step];
    const span = Math.max(1e-6, h.swing.strikeAt - h.swing.start);
    return {
      dir: h.swing.dir,
      heft: s?.heft ?? 0.3,
      progress: Math.min(1, Math.max(0, (w.t - h.swing.start) / span)),
      color: h.stats.weapon.element ? MANA_HEX[h.stats.weapon.element] : 0xd4a834,
    };
  }
  if (h.windup) {
    const ab = h.abilities[h.windup.slot];
    if (!ab) return null;
    const dx = h.windup.at.x - h.x;
    const dy = h.windup.at.y - h.y;
    const len = Math.hypot(dx, dy);
    const span = Math.max(1e-6, h.windup.until - h.windup.start);
    return {
      dir: len > 1e-6 ? { x: dx / len, y: dy / len } : { ...h.facing },
      heft: stepHeft(ab, h.windup.step),
      progress: Math.min(1, Math.max(0, (w.t - h.windup.start) / span)),
      color: MANA_HEX[ab.element],
    };
  }
  return null;
}
```

- [ ] **Step 4: Gather at a point; draw anticipation**

`mana-fx.ts` `gather(x, y, color, n = 2)`: remove the internal `- 0.3` so pixels converge on exactly `(x, y)`. Callers pass the hand point.

`draw-world.ts`: import `{ windingUp }` from `./anticipation`, and add

```ts
/** Mana gathering at the hand while an action winds up: more with heft; heavy ones spiral in around a growing orb. */
export function drawAnticipation(
  air: Graphics,
  fx: ManaFx,
  w: ArpgWorld,
  time: number,
  dt: number,
): void {
  const a = windingUp(w);
  if (!a) return;
  const h = w.hero;
  const hx = h.x + a.dir.x * 0.35;
  const hy = h.y - 0.3 + a.dir.y * 0.35;
  // No new pixels while the display is frozen (they would pile up without moving).
  if (dt > 0) fx.gather(hx, hy, a.color, 1 + Math.round(a.heft * 3));
  if (a.heft >= 0.7) {
    manaMotes(air, hx, hy, 0.2 + 0.9 * (1 - a.progress), a.color, time, 5, 9, 0.9, 4);
    manaOrb(air, hx, hy, 0.05 + 0.2 * a.progress, a.color, 0xffffff, 0.9);
  }
}
```

In `drawGuard`'s wind-up block remove `fx.gather(h.x, h.y, color);`, because anticipation owns the gather now. That leaves `drawGuard`'s `fx` parameter unused (`noUnusedParameters` would fail `tsc`), so drop it from the signature and call `drawGuard(air, w, this.time)`. In `ArenaRenderer.ts`, add `drawAnticipation` to the `./fx/draw-world` import and `import { windingUp } from './fx/anticipation';`, then call `drawAnticipation(air, this.fx, w, this.time, dt);` after `drawGuard`.

- [ ] **Step 5: Lean and camera kick**

In `ArenaRenderer`:
- Add `private kick = { x: 0, y: 0 };` and reset it in the world-reset path, where `trails.clear()` runs.
- Add a method:

```ts
  /** Nudge the camera toward a strike, by its heft; heavy ones shake too. */
  private kickCamera(dir: Vec, heft: number): void {
    const len = Math.hypot(dir.x, dir.y) || 1;
    this.kick.x += (dir.x / len) * 0.12 * heft;
    this.kick.y += (dir.y / len) * 0.12 * heft;
    if (heft >= 0.7) this.addShake(0.15 * heft);
  }
```

- Call it in `case 'basic'` (`this.kickCamera(e.dir, e.heft)`) and `case 'cast'` (`this.kickCamera({ x: e.tx - e.x, y: e.ty - e.y }, e.heft)`).
- In `update`, after the camera easing, decay the kick with `const kd = Math.exp(-dt / 0.04); this.kick.x *= kd; this.kick.y *= kd;` and include it in the root position: `this.root.position.set(width / 2 - (cx + this.kick.x) * u + sx, playTop + playH / 2 - (cy + this.kick.y) * u + sy);`.
- In `syncHero` (sprite branch), replace `s.position.set(0, 0.5);` with a lean:

```ts
      // Winding up: lean a pixel back from the target, and lift one for heavy moves.
      const a = windingUp(w);
      const lx = a ? -Math.round(a.dir.x) * SPRITE_PIXEL : 0;
      const ly = a ? -Math.round(a.dir.y) * SPRITE_PIXEL - (a.heft >= 0.7 ? SPRITE_PIXEL : 0) : 0;
      s.position.set(lx, 0.5 + ly);
```

- [ ] **Step 6: Run the client checks**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/features/delve/arena
git commit -m "feat(client): anticipation, a lean into each wind-up, and a camera kick on strikes"
```

### Task 15: Swings sweep

**Files:**
- Modify: `packages/client/src/features/delve/arena/fx/mana-fx.ts`, `features/delve/arena/ArenaRenderer.ts`

- [ ] **Step 1: Rework `ManaFx.swing`**

Replace the `Swing` interface, `swing()` and its draw loop:

```ts
interface Swing {
  x: number;
  y: number;
  angle: number;
  arc: number;
  range: number;
  color: number;
  age: number;
  life: number;
  heft: number;
  /** Sweep from the other side (backslash). */
  reverse: boolean;
  finisher: boolean;
}

const SWEEP_SECONDS = 0.1;

  /**
   * A melee blow: a pixel smear that travels across the arc (alternate
   * sides for a backslash), brighter and longer for heavy blows. A finisher
   * adds a shockwave at the tip; a full-circle heavy blow (a slam) bursts a
   * ring of ground pixels and dust.
   */
  swing(
    x: number,
    y: number,
    angle: number,
    arc: number,
    range: number,
    color: number,
    o: { heft?: number; reverse?: boolean; finisher?: boolean } = {},
  ): void {
    const heft = o.heft ?? 0.3;
    const life = SWEEP_SECONDS + 0.12 + 0.12 * heft + (o.finisher ? 0.08 : 0);
    // The blade has mostly swept by the moment it connects, so a hit-stop on this frame shows the arc.
    this.swings.push({
      x, y, angle, arc, range, color, age: SWEEP_SECONDS * 0.6, life, heft,
      reverse: !!o.reverse,
      finisher: !!o.finisher,
    });
    const end = o.reverse ? angle - arc / 2 : angle + arc / 2;
    const tx = x + Math.cos(end) * range;
    const ty = y + Math.sin(end) * range;
    this.burst(tx, ty, color, 3 + Math.round(heft * 5), 2.5 + heft * 2);
    if (o.finisher && arc < Math.PI * 2 - 1e-3) {
      const hx = x + Math.cos(angle) * range;
      const hy = y + Math.sin(angle) * range;
      this.ring(hx, hy, 0.5 + heft * 0.4, color, false, 0.25);
    }
    if (arc >= Math.PI * 2 - 1e-3 && heft >= 0.9) {
      this.ring(x, y, range, color, true, 0.4);
      this.burst(x, y + 0.2, 0xd6d3d1, 18, 3);
    }
  }
```

Draw loop:

```ts
    for (const s of this.swings) {
      s.age += dt;
      const p = Math.min(1, s.age / SWEEP_SECONDS);
      const fade = 1 - Math.max(0, (s.age - SWEEP_SECONDS) / (s.life - SWEEP_SECONDS));
      const sign = s.reverse ? -1 : 1;
      const from = s.angle - (sign * s.arc) / 2;
      const head = from + sign * s.arc * p;
      const thick = s.heft >= 0.6 ? 3 : 2;
      manaArc(g, s.x, s.y, s.range, from, head, s.color, 0.9 * fade, thick);
      // The leading edge is white-hot while it travels.
      const edge = Math.min(0.3, s.arc * 0.2);
      manaArc(g, s.x, s.y, s.range + PX, head - sign * edge, head, 0xffffff, fade, 1);
      if (s.finisher) manaArc(g, s.x, s.y, s.range + PX * 2, from, head, s.color, 0.6 * fade, 1);
    }
    this.swings = this.swings.filter((s) => s.age < s.life);
```

- [ ] **Step 2: Call it per blow**

In `ArenaRenderer` `case 'basic'` (melee), pass `{ heft: e.heft, reverse: e.step % 2 === 1, finisher: e.finisher }` in place of the old `0.16` life argument. In `case 'slash'`, pass `{ heft: w.hero.abilities.find((a) => a.form.id === 'strike')?.heft ?? 0.5, finisher: e.arc >= 360 }` (drop the old life argument and the `fx.lunge` line if it is still there).

- [ ] **Step 3: Check and commit**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve`
Expected: PASS.

```bash
git add packages/client/src/features/delve/arena
git commit -m "feat(client): melee blows sweep across their arc; finishers and slams land harder"
```

### Task 16: Throws and beams that travel

**Files:**
- Modify: `packages/client/src/features/delve/arena/fx/draw-world.ts` (`drawLobs`, Burst skipped in `drawZones`), `features/delve/arena/fx/mana-fx.ts` (`beam`), `features/delve/arena/ArenaRenderer.ts`

- [ ] **Step 1: The thrown Burst**

In `drawZones`, skip `z.source === 'burst'` in the hero `detonateAt > 0` branch (`if (z.source === 'burst') continue;` at the top of that branch). Add:

```ts
/** A thrown Burst: an orb arcing to its landing ring, over a shadow that tracks it along the ground. */
export function drawLobs(ground: Graphics, air: Graphics, w: ArpgWorld, time: number): void {
  for (const z of w.zones) {
    if (z.owner !== 'hero' || z.source !== 'burst' || z.fromX === undefined || z.fromY === undefined)
      continue;
    const p = progress(w.t, z.born, z.detonateAt);
    const color = elem(z.element);
    const x = z.fromX + (z.x - z.fromX) * p;
    const y = z.fromY + (z.y - z.fromY) * p;
    const height = Math.sin(Math.PI * p) * 0.25 * Math.hypot(z.x - z.fromX, z.y - z.fromY);
    manaRing(ground, z.x, z.y, z.radius, color, time, { alpha: 0.25 + 0.6 * p, gaps: 4, spin: 6 });
    // A filled shadow that grows as the orb comes down; the orb lands on the ring.
    manaOrb(ground, x, y, 0.12 + 0.1 * p, 0x000000, 0x000000, 0.35);
    manaOrb(air, x, y - 0.3 * (1 - p) - height, 0.18, color, 0xffffff, 1);
  }
}
```

Add `drawLobs` to `ArenaRenderer.ts`'s `./fx/draw-world` import and call `drawLobs(ground, air, w, this.time);` in `update` after `drawZones`.

- [ ] **Step 2: The lance extends, then fades from base to tip**

In `ManaFx`, replace the `Beam` interface and the `beam()` method:

```ts
interface Beam {
  x: number;
  y: number;
  tx: number;
  ty: number;
  width: number;
  color: number;
  age: number;
  life: number;
}

  beam(x: number, y: number, tx: number, ty: number, width: number, color: number): void {
    this.beams.push({ x, y, tx, ty, width, color, age: 0, life: 0.36 });
  }
```

and replace the beam draw loop:

```ts
    for (const b of this.beams) {
      b.age += dt;
      const grow = Math.min(1, b.age / 0.06);
      const fadeP = Math.max(0, (b.age - 0.06) / (b.life - 0.06));
      const tipX = b.x + (b.tx - b.x) * grow;
      const tipY = b.y + (b.ty - b.y) * grow;
      const baseX = b.x + (b.tx - b.x) * fadeP;
      const baseY = b.y + (b.ty - b.y) * fadeP;
      const thick = Math.max(1, Math.round((b.width * 2 * (1 - fadeP)) / PX));
      manaLine(g, baseX, baseY, tipX, tipY, b.color, 0.75, { thickness: thick, jitter: 1, time });
      manaLine(g, baseX, baseY, tipX, tipY, 0xffffff, 0.95, { thickness: 1 });
      // It sheds pixels as it fades.
      if (fadeP > 0 && this.particles.length < MAX_PARTICLES)
        this.particles.push({
          x: baseX, y: baseY,
          vx: (Math.random() - 0.5) * 1.2, vy: -0.8 - Math.random(),
          life: 0.4, max: 0.4, color: b.color, size: 1, drag: 0.95,
        });
    }
    this.beams = this.beams.filter((b) => b.age < b.life);
```

- [ ] **Step 3: Check and commit**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve`
Expected: PASS.

```bash
git add packages/client/src/features/delve/arena
git commit -m "feat(client): Burst flies in an arc; lances extend and fade from the hand"
```

### Task 17: Births and endings

**Files:**
- Create: `packages/client/src/features/delve/arena/fx/lifecycles.ts`
- Modify: `features/delve/arena/fx/mana-fx.ts` (`disperse`), `features/delve/arena/fx/draw-world.ts` (export `elem`, `HOSTILE`; pop-in in `drawProjectiles`), `features/delve/arena/ArenaRenderer.ts`
- Test: `packages/client/src/features/delve/arena/fx/__tests__/lifecycles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ArpgWorld } from '@alloy/engine';
import { Lifecycles } from '../lifecycles';

const fx = () => ({ burst: vi.fn(), disperse: vi.fn() });
function world(over: Partial<ArpgWorld>): ArpgWorld {
  return {
    t: 1,
    projectiles: [],
    zones: [],
    hero: { x: 0, y: 0, defend: null, abilities: [{ element: 'frost' }, { element: 'frost' }] },
    ...over,
  } as unknown as ArpgWorld;
}
const shot = { id: 7, owner: 'hero', x: 1, y: 2, radius: 0.3, element: 'fire', dead: false };
const zone = { id: 9, owner: 'hero', x: 3, y: 3, radius: 2, element: 'storm', detonateAt: 0 };

describe('Lifecycles', () => {
  it('sparks a new shot at the hand and dissolves it when it goes', () => {
    const l = new Lifecycles();
    const f = fx();
    l.update(world({ projectiles: [shot] as never }), f as never, 1);
    expect(f.burst).toHaveBeenCalledTimes(1);
    expect(l.bornAt(7)).toBe(1);
    l.update(world({}), f as never, 1.1);
    expect(f.disperse).toHaveBeenCalledTimes(1);
  });

  it('dissolves a lingering zone and a guard when they end', () => {
    const l = new Lifecycles();
    const f = fx();
    l.update(
      world({ zones: [zone] as never, hero: { x: 0, y: 0, defend: { form: 'ward', until: 5 }, abilities: [{}, { element: 'frost' }] } as never }),
      f as never,
      1,
    );
    l.update(world({}), f as never, 1.1);
    expect(f.disperse).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/lifecycles.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`ManaFx.disperse`:

```ts
  /** Something ends: its pixels scatter outward and drift up instead of vanishing. */
  disperse(x: number, y: number, r: number, color: number, n = 24): void {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: Math.cos(a) * 0.8,
        vy: Math.sin(a) * 0.8 - 0.6,
        life: 0.6 + Math.random() * 0.3,
        max: 0.9,
        color,
        size: 1,
        drag: 0.97,
      });
    }
  }
```

`fx/lifecycles.ts`:

```ts
import type { ArpgWorld } from '@alloy/engine';
import { MANA_HEX } from '../palette';
import { elem, shotColor } from './draw-world';
import type { ManaFx } from './mana-fx';

type Fx = Pick<ManaFx, 'burst' | 'disperse'>;

/**
 * Watches effects come and go: a new shot sparks at the hand (and pops in;
 * see `bornAt`), and whatever ends (shots, lingering zones, a guard)
 * scatters into drifting pixels instead of vanishing.
 */
export class Lifecycles {
  private shots = new Map<number, { x: number; y: number; r: number; color: number; born: number }>();
  private zones = new Map<number, { x: number; y: number; r: number; color: number }>();
  private guard: number | null = null;

  bornAt(id: number): number | undefined {
    return this.shots.get(id)?.born;
  }

  update(w: ArpgWorld, fx: Fx, time: number): void {
    const seen = new Set<number>();
    for (const p of w.projectiles) {
      if (p.dead) continue;
      seen.add(p.id);
      const color = shotColor(p);
      const known = this.shots.get(p.id);
      if (!known) fx.burst(p.x, p.y, color, 4, 3);
      this.shots.set(p.id, { x: p.x, y: p.y, r: p.radius, color, born: known?.born ?? time });
    }
    for (const [id, s] of this.shots)
      if (!seen.has(id)) {
        fx.disperse(s.x, s.y, s.r, s.color, 6);
        this.shots.delete(id);
      }

    seen.clear();
    for (const z of w.zones) {
      if (z.owner !== 'hero' || z.detonateAt > 0) continue;
      seen.add(z.id);
      this.zones.set(z.id, { x: z.x, y: z.y, r: z.radius, color: elem(z.element) });
    }
    for (const [id, z] of this.zones)
      if (!seen.has(id)) {
        fx.disperse(z.x, z.y, z.r, z.color, Math.min(60, Math.round(z.r * 14)));
        this.zones.delete(id);
      }

    const h = w.hero;
    const guarding = !!h.defend && w.t < h.defend.until;
    if (this.guard !== null && !guarding) fx.disperse(h.x, h.y - 0.3, 1, this.guard, 30);
    const el = h.abilities[1]?.element;
    this.guard = guarding && el ? MANA_HEX[el] : null;
  }

  clear(): void {
    this.shots.clear();
    this.zones.clear();
    this.guard = null;
  }
}
```

In `draw-world.ts`, export `elem`, and add a shared colour rule (use it in `drawProjectiles` in place of its inline `color`):

```ts
/** A projectile's colour: monster shots are their element or hostile red; the hero's are its element. */
export function shotColor(p: Projectile): number {
  return p.owner === 'monster' ? (p.element ? MANA_HEX[p.element] : HOSTILE) : elem(p.element);
}
```

Give `drawProjectiles` a fifth parameter `bornAt: (id: number) => number | undefined` (after `trails`), and pop each shot in over its first 0.05 s. At the top of the loop body:

```ts
    const born = bornAt(p.id);
    const k = born === undefined ? 1 : Math.min(1, (time - born) / 0.05);
    const r = (v: number) => Math.max(PX, v * k);
```

and wrap every drawn radius in `r(...)`: `p.radius`, the `0.15` orbs and the `p.radius + PX * 2` rings.

In `ArenaRenderer`:
- import `{ Lifecycles }` from `./fx/lifecycles`;
- add `private lifecycles = new Lifecycles();` and clear it wherever `this.trails.clear()` runs;
- call `this.lifecycles.update(w, this.fx, this.time);` in `update` before `drawProjectiles`;
- pass `(id) => this.lifecycles.bornAt(id)` to `drawProjectiles`.

- [ ] **Step 4: Run the client checks**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena
git commit -m "feat(client): shots spark at the hand, and effects dissolve instead of vanishing"
```

### Task 18: Look at it, verify, ship v0.40.0

- [ ] **Step 1: Screenshots**

With the dev server on 5288 and the Task 12 scratch config recreated, write a scratch spec `packages/client/e2e/zz-feel.spec.ts`:
- **Save:** build it in Node with `createDelveProfile(createDefaultRegistry(), 4242)` and `setAbility` (`packages/engine/src/delve/profile.ts`), and seed it like `seedProfile(page, seed, false)` in `e2e/delve.spec.ts` (autopilot off).
- **Display speed:** also set `localStorage['alloy:delve:timescale'] = '0.25'` so a 0.1 s sweep spans several screenshots (each takes well over 30 ms).
- **Pass A:** Primary Crushing Strike (`{ form: 'strike', elements: ['fire'], weight: 2, payment: 'mana' }`), Defensive Crushing Ward, Ultimate Crushing Nova (mana payment).
- **Pass B:** Primary Lance, Defensive Ward, Ultimate Maelstrom.
- **Pass C:** Primary Burst (the thrown lob), the rest default.
- **In each pass:**
  - switch to manual attacks with the dive menu's `attack-mode-toggle` (as D05 does);
  - walk to the nearest pack, hold left click on a foe for 2 s, then press Q, E and R aimed at it;
  - screenshot crops around the hero every frame you can get.

Save the crops to the session scratchpad `shots/` folder. View them and check:
- the swing smear sweeps;
- the finisher shockwave shows;
- the Burst arc and shadow show;
- the lance extends;
- things dissolve;
- the hero leans and lunges.

Tune numbers in `mana-fx.ts` / `draw-world.ts` if something reads poorly. Delete the scratch spec (keep the scratch config for Step 2).

- [ ] **Step 2: Full verification**

Run:
- `cd packages/engine && npx vitest run`
- `cd packages/client && npx tsc --noEmit -p . && npx vitest run`
- the Delve E2E through the scratch config (Task 12 Step 1).

Expected: all green (retry only proven flakes). Then delete the scratch config.

- [ ] **Step 3: Docs, version, commit, push**

- CLAUDE.md, Mana-pixel FX bullet: add "Hits carry heft: heavy ones freeze the display briefly (`fx/hitstop.ts`) and kick the camera; wind-ups lean the hero and gather mana (`fx/anticipation.ts`); shots spark at the hand and effects dissolve when they end (`fx/lifecycles.ts`)."
- Spec status: `**Status:** Built in v0.39.0 (engine) and v0.40.0 (feel).`
- `packages/client/package.json`: `"version": "0.40.0"`.

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md packages/client/package.json
git commit -m "docs: combat feel in the Delve notes

chore(client): bump version to 0.40.0"
git push -q origin claude/alloy-loot-gear-system-6upsy5
```
