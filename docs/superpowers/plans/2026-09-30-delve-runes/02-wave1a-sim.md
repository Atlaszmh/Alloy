# Delve Runes, Wave 1A: the Sim — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every rune act in the fight. A move's active runes merge into its `ResolvedAbility` (and a blow's into its `HeroBlow.knobs`), and each new behaviour knob gets its one handler in the sim: `split` (shards), `extraShots` (fans, more darts and impacts), `echo` (the move or blow again), `quick` (beat, cooldown and wind-up; a blow's cycle and startup), `stacksBonus`, `catalyst` (Volatile in `react`), `manaOnHit` (Drain, 5 foe-hits a cast), `guardOnLand` (Guard, into Obsidian's barrier), the pierce count on shots, Linger's zones on blows, and the reused knobs (power, area, applies, chain, lifesteal) on blows. With no rune socketed, nothing changes: the DPS Lab grid, the pacing, the first dives and the items hash stay identical to the wave-0 "before" files.

**Architecture:** One knob a task, in the order of the spec's knob table, each tested through the real sim. `resolve.ts` merges `runeKnobs(…)` after the legendaries (leaving out a Pierce on a move that already pierces every foe), and folds `quick`, `stacksBonus` and `extraShots` into the numbers it resolves; `computeHeroStats` does the same for each blow. The blow's damage half moves out of `strike` into `landBlow`, which the strike and a blow's echo both call, and which every blow knob reads. `chainFrom`'s body becomes `chainJumps`, shared by abilities and blows. Split's shards come from one helper, `shedShards`, for an ability's impact and a basic shot's hit; a basic shot's knobs act where it lands through `shotLands`. Echo runs from `abilities/echo.ts` (`queueEcho`, `echoTick` right after `castTick`). Volatile and Drain are hit-time knobs carried by `knobHitOpts` into `hitMonster` and `react`; Guard is `guardLand` in `defend.ts`, called where a move or a blow lands.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node), the engine's arena fixture (`tests/fixtures/arena.ts`).

**Spec:** `docs/superpowers/specs/2026-09-30-delve-runes-design.md` at `81b0e31`: "Knobs: the shared behaviour", "Each rune in the sim", "Determinism", and "Build waves → Wave 1 → A". Read the overview (`00-overview.md`) for the shared conventions, and the end of `01-wave0-contract.md` for the stubs and placeholders this area replaces.

**Base:** wave 0's head, `runes/contract` at `b216703` (worktree `C:\Projects\alloy-contract`: `29140ca` plus its review fixes, among them a frozen `NEUTRAL`). Nothing else needs merging first; waves 1B and 1C run beside this one. This area runs in its own worktree, `../alloy-sim` on branch `runes/sim`, made from `b216703`.

---

## How this plan was checked

Every edit below was applied, in order, to a copy of `b216703` (every file CRLF, as a fresh worktree checks it out) by `apply2.mjs`'s rules, and each task's tests were run at both of their steps; the expected failures and passes below are those runs. At the end:

- the engine's suite goes from wave 0's **1466 passed and 14 todo (1480) in 79 files** to **1525 passed and 10 todo (1535) in 80 files**; its typecheck is clean;
- against wave 0's "before" files (`$S/runes-before/`), with no rune socketed: the DPS Lab grid (9,144 runs) has **0 differing rows**, the pacing output and the first dives are **byte-identical**, and the items hash is **the same**.

## Where the spec left room (decided here)

- **`landBlow`'s signature.** The spec gives `landBlow(ctx, blow, row, dir, powerMult)`. It is `landBlow(ctx, blow, kind, dir, powerMult, o = {})`: it takes the kind the blow struck as (a held blow's stage's), since the stacks are by kind and the row follows from it (`kind === blow.kind ? blow : weapon.feel[kind]`), and `o` carries Twin Fang's share and the swing's target (a melee swing's target is struck whatever its angle). An echo passes neither: it never fires Twin Fang.
- **A shard's impact is the shard's size (0.2), not radius 0.** A projectile hits a foe at `p.radius + m.radius`; an impact of radius 0 at the shard reaches only `m.radius`, so it would often miss the foe the shard touched. With the shard's own radius it hits what it touches, as the spec's "one impact" intends.
- **`world.ts`'s `sameChain` and the raw sockets.** `ResolvedChain` keeps no raw chain, so `resolveAll` records each resolved chain's source in a `WeakMap` (`SOURCES`), and `sameChain` compares `runes` arrays from it (by id and tier, null for an empty socket; absent is `[]`). A chain the world didn't resolve has no source and reads as no sockets.
- **Widen on a melee blow** scales the strike's reach only; the swing's look-ahead (when an automatic swing starts, how far its lunge seeks) is unchanged.
- **Linger on a blow** leaves its zone when a melee blow connects (as a Strike's does), and where a shot first hits (as Split acts, so a piercing bow shot leaves one zone, not one per foe). The zone is a hero zone with `ability: null` and source `'linger'`; its ticks carry no knobs (the spec leaves `Zone` unchanged), so they neither drain nor leech.
- **Echo.** A blow's echo is queued whenever the blow strikes (the spec: "`strike` queues"), whiff or not; an ability's only when `fire` succeeds. An echo whose form finds nothing to aim at fizzles without a `runeFx`. `echoTick` makes no `basic` event for a blow's echo (07's question 2: the DPS Lab counts `basic` events as swings).
- **The `runeFx` points.** Split: the impact point (an ability's) or the shot's position (a basic shot's). Echo: where an ability's echo lands (`executeForm`'s `tx`, `ty`), or the hero for a blow's. Volatile: the foe whose reaction it scaled, from `hitMonster` when the hit's `catalyst` is above 0 and the reaction is a damage reaction or Soulfire.
- **A blow's jumps** (Chain) hit as basic hits that can crit, with the blow's `applies`, `rattles` and hit-time knobs and a tick's stacks, knocked back from the foe they jump from by `chainJumps`' rule (the blow's own knockback doesn't ride along).
- **Basic shards** carry the shot's element and `applies` and a tick's stacks, no knobs, no `rattles`, and heft 0; an ability's carry the move with `split`, `extraShots`, `echo`, `zone`, `chain` and `guardOnLand` cleared. A shot that bursts sheds its shards only when its burst hit a foe.
- **A held blow's recomputed rest** is written `cycle × max(0, 1 − startup × windup ÷ beat)`, which is `cycle − min(cycle, base × startup × windup)`, so that with neutral knobs it is today's `cycle × (1 − startup)` to the last bit. The same care keeps every other neutral path bit-identical: `× 1` and `+ 0` only.
- **Blows without an active rune keep wave 0's shared `NEUTRAL`** as their knobs (`toBe(NEUTRAL)` in wave 0's tests still holds); one with runes gets a fresh `mergeKnobs(…)`.
- **`NEUTRAL` is frozen** (wave 0's review fix): every knob object this plan builds is a new one (`mergeKnobs`, or a spread), never `NEUTRAL` changed in place; tests do the same.
- **`blowNumbers`** (the builder's readout, and D's Power) takes the blow's `knobs.power` and `stacksBonus`, so it stays "as the sim deals them".

## Files

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/arpg/abilities/resolve.ts` | runes merged into `resolveAbility` (Pierce left out on an infinite pierce), `runes`; `quick` into cooldown, conjure and channel; `stacksBonus`; Multi-shot's count and cut (`extraShotPower`); `blowNumbers` with the blow's knobs; `followBasic` keeping blow runes (CRLF, never format) |
| `src/arpg/abilities/impact.ts` | `knobHitOpts`; Split's `shedShards` and the shard impact (`ImpactOpts.shard`); `chainJumps` (and `chainFrom` over it) |
| `src/arpg/abilities/forms.ts` | Bolt's and Lance's fans |
| `src/arpg/abilities/cast.ts` | `fire`: Drain's reset, Guard, the echo queued |
| `src/arpg/abilities/defend.ts` | `guardLand`; Armor's strike-back through `knobHitOpts` |
| `src/arpg/abilities/echo.ts` | `queueEcho`, `echoTick` (wave 0's stubs replaced) |
| `src/arpg/abilities/targeting.ts` | `spawnProjectile`'s optional `hitIds` (CRLF, never format) |
| `src/arpg/basic.ts` | `landBlow`; the blow's knobs: power, applies, area, chain, Linger, stacks, extra shots, pierce, quick; `shotLands`; `burstShot`'s knobs; Drain's reset, Guard, the echo queued |
| `src/arpg/step.ts` | a basic shot's knobs on its hit; shards in flight; `echoTick`; a blow's Linger ticks |
| `src/arpg/combat.ts` | Volatile in `react` and its `runeFx`; Drain in `hitMonster` |
| `src/arpg/world.ts` | `sameChain` on the raw sockets |
| `src/delve/hero-stats.ts` | each blow's `runeKnobs` merged (see Cross-area needs) |
| `tests/delve-rune-sim.test.ts` (new) | every rune on every target it fits, through the real sim |
| `tests/delve-runes-contract.test.ts` | wave 0's `it.todo` block for 1A removed (Task 13) |

**Outside the repo:** the measuring build `packages/engine/node_modules/.runes-1a-measure` (deleted at the end) and its outputs in `$S/runes-1a/`.

## Cross-area needs

1. **`src/delve/hero-stats.ts` (B's in wave 1, D's in wave 2).** The spec ("A … into the blows in `computeHeroStats` (`knobs`, `runes`)") and wave 0's placeholder table (`HeroBlow.knobs: NEUTRAL`, `runes: []` → "1A") both give this edit to 1A, and B's plan has no reason to touch `computeHeroStats`. Task 2 makes it: three edits, an import of `mergeKnobs`, an import of `runeKnobs`, and the `blows` map. Nothing else in the file changes. The controller should let 1A make it (or move the same three edits to B, before 1A's Task 2).
2. **`tests/delve-runes-contract.test.ts` (wave 0's).** Wave 0 says an area that builds a stub may delete its `it.todo` lines; Task 13 deletes the 1A block (its 4 todos: `knobHitOpts`, `guardLand`, `queueEcho`/`echoTick`, and the runes merged into moves and blows), once all of them are built; this file's tests replace them. B deletes its own two blocks; the three are apart, so the edits don't meet.

No other file outside `src/arpg/**` changes. `src/index.ts` needs nothing: `echo.ts` is re-exported whole, `knobHitOpts` and `guardLand` by name; the new internal helpers (`landBlow`, `chainJumps`, `shedShards`, `shotLands`) aren't exported.

For the other areas: D reads `HeroBlow.knobs` and the new `blowNumbers`; F's flashes come from the `runeFx` events this area pushes (`split` at the impact, `echo` where the echo lands or at the hero, `volatile` at the foe).

## Conventions, line endings and commands

The overview's shared conventions apply. In particular:

- **Line endings.** A fresh worktree checks out every file CRLF (`core.autocrlf` is on); git stores LF. `resolve.ts` and `targeting.ts` are CRLF in the main working tree too and are hand-edited only, never formatted. Every other file this plan touches passes `npx prettier --check` at `b216703` once its endings are LF; the commit blocks run `prettier --write` on those (which also turns them LF in the worktree: no diff in git). The code below is already formatted.
- **Edits** read as the 4a plan's "How the edits read", applied top to bottom per file; every anchor was checked unique at its point.
- **Engine test geometry.** The fixture arena's hero stands at (13, 36) facing up; `dummy(x, y)` is a sturdy Fire foe (1e6 life) that doesn't fight back; the fixture's weapon is a common Fire sword, its chains one medium move each (a Fire Bolt, a Frost Ward, a charged Fire Nova) unless `ArenaOpts` gives others. `R('chain')` in the tests is Chain III; a move's runes ride on it (`primary: { runes: [...] }`), a blow's on its `Blow` (`blowWorld([...])`).

Run from the worktree's root (`C:\Projects\alloy-sim`; in Bash `/c/Projects/alloy-sim`), each in a subshell:

| What | Command |
|---|---|
| This area's test file | `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)` |
| All engine tests (about 20 s, the pacing rails included) | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| The measuring build | `(cd packages/engine && npx tsup --out-dir node_modules/.runes-1a-measure)` |

`$S` is the scratchpad: `S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad`. Node takes `C:/` paths: `M=C:/Projects/alloy-sim/packages/engine/node_modules/.runes-1a-measure/index.js`.

---

## Chunk 1: Runes on moves and blows

### Task 0: Set up the worktree

No commit.

- [ ] **Step 1: Make the worktree and link its `node_modules`**

PowerShell (Git Bash's `cmd //c mklink` mangles the switches):

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-sim -b runes/sim b216703
$W = 'C:\Projects\alloy-sim'
New-Item -ItemType Directory -Force "$W\node_modules", "$W\packages\engine\node_modules" | Out-Null
foreach ($e in 'typescript', 'prettier', '.pnpm') { cmd /c mklink /J "$W\node_modules\$e" "C:\Projects\Alloy\node_modules\$e" }
foreach ($e in 'tsup', 'vitest', 'zod', '.bin') { $t = @((Get-Item "C:\Projects\Alloy\packages\engine\node_modules\$e").Target)[0]; if (-not $t) { $t = "C:\Projects\Alloy\packages\engine\node_modules\$e" }; cmd /c mklink /J "$W\packages\engine\node_modules\$e" $t }
```

- [ ] **Step 2: Check the base**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1466 tests pass and 14 are todo (1480) in 79 files.

### Task 1: Runes merge into the move they sit on

`resolveAbility` merges the move's active runes (`runeKnobs` on `{ form }`) after its elements, fusion and legendaries, and lists them in `ResolvedAbility.runes`. A Pierce on a move whose pierce is already infinite (an Earth Bolt or dart) is left out of both, its trade-off with it: `resolveAbility` decides that, and the builder's dormant marks and the HUD's dots both read `runes`. Every reused knob then works on an ability with no new code: a rune's `power` (Heavy, and the trade-offs), `area` (Widen), `applies` (Heavy's stagger), `chain` (Chain), `zone` (Linger, the field-by-field merge wave 0 wrote), `lifesteal` (Leech, already `hitOpts`' `leech`) and `pierce` (wave 0's `pierceLeft` from the knob). The tests pin each through the sim.

**Files:**
- Create: `packages/engine/tests/delve-rune-sim.test.ts`
- Modify: `packages/engine/src/arpg/abilities/resolve.ts` (CRLF, never format)

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/tests/delve-rune-sim.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import { STEP, arena, dummy, moveOf, press, run, type ArenaOpts } from './fixtures/arena.js';

// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing
// up; `dummy(x, y)` is a sturdy Fire foe that doesn't fight back. A move's runes ride on it
// (`Move.runes`, `Blow.runes`): `R('chain')` is Chain III.

const R = (id: string, tier: RuneTier = 3): RuneRef => ({ id, tier });

/** Sturdy foes, the hero's basic attack stopped (only abilities deal damage). */
function world(monsters: Partial<MonsterEntity>[], opts: ArenaOpts = {}): ArpgWorld {
  return arena(monsters, { noBasic: true, ...opts });
}

/** The skill hits of slot `slot` (the Primary by default). */
const skillHits = (events: ArpgEvent[], slot = 0) =>
  events.flatMap((e) => (e.kind === 'hit' && e.source === 'skill' && e.slot === slot ? [e] : []));

/** Step `w` until an event of `kind` (at most 3 s), returning every event. */
function until(w: ArpgWorld, kind: ArpgEvent['kind']): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < 90 && !events.some((e) => e.kind === kind); i++) events.push(...run(w, STEP));
  return events;
}

describe('runes merge into the move they sit on (resolveAbility)', () => {
  it('lists the runes acting on it in socket order, past empty sockets, unknown ids and runes that do not fit', () => {
    const w = world([], {
      primary: { runes: [R('chain'), null, R('nope'), R('widen'), R('leech', 5)] },
    });
    expect(moveOf(w, 0).runes).toEqual([R('chain'), R('leech', 5)]);
    expect(moveOf(w, 1).runes).toEqual([]);
  });

  it("merges each rune's tier after the elements, the fusion and the legendaries: its trade-off too", () => {
    const plain = moveOf(world([]), 0);
    const heavy = moveOf(world([], { primary: { runes: [R('heavy')] } }), 0);
    expect(heavy.power / plain.power).toBeCloseTo(1.3);
    expect(heavy.knobs.applies).toEqual(['burn', 'stagger']);
    const pierce = moveOf(world([], { primary: { runes: [R('pierce', 2)] } }), 0);
    expect(pierce.knobs.pierce).toBe(2);
    expect(pierce.power / plain.power).toBeCloseTo(0.9);
    // Linger under Magma (Fire + Earth: 3 s at 0.25): the longer zone, at the stronger tick.
    const magma = world([], { primary: { elements: ['fire', 'earth'], runes: [R('linger', 5)] } });
    expect(moveOf(magma, 0).knobs.zone).toEqual({ seconds: 3.5, tickPower: 0.25 });
  });

  it('leaves out a Pierce on a move that already passes every foe (an Earth Bolt): dormant, trade-off and all', () => {
    const plain = moveOf(world([], { primary: { elements: ['earth'] } }), 0);
    const w = world([], { primary: { elements: ['earth'], runes: [R('pierce'), R('chain')] } });
    expect(moveOf(w, 0).runes).toEqual([R('chain')]);
    expect(moveOf(w, 0).knobs.pierce).toBe(Infinity);
    expect(moveOf(w, 0).power).toBeCloseTo(plain.power);
  });

  it('Pierce: a Bolt passes that many foes, bursting on each, and dies on the next', () => {
    const w = world([dummy(13, 33), dummy(13, 31), dummy(13, 29), dummy(13, 27)], {
      primary: { runes: [R('pierce', 2)] },
    });
    press(w, 0);
    run(w, 1);
    expect(w.monsters.map((m) => m.hp < m.maxHp)).toEqual([true, true, true, false]);
  });

  it('Chain: the Bolt jumps from the first foe it bursts on', () => {
    const w = world([dummy(13, 30), dummy(16, 30), dummy(19, 30)], {
      primary: { runes: [R('chain')] },
    });
    const events = [...press(w, 0), ...run(w, 1)];
    const chain = events.find((e) => e.kind === 'chain');
    expect(chain?.kind === 'chain' && chain.points.length).toBe(3);
    expect(w.monsters.every((m) => m.hp < m.maxHp)).toBe(true);
  });

  it('Widen: a Nova reaches further (radius × area) at its power cut', () => {
    const at = (runes: RuneRef[]) => {
      const w = world([dummy(13, 28)], { ultimate: { payment: 'mana', runes } });
      press(w, 2);
      return { w, ab: moveOf(w, 2) };
    };
    const plain = at([]);
    const wide = at([R('widen')]);
    expect(wide.ab.radius / plain.ab.radius).toBeCloseTo(1.4);
    expect(wide.ab.power / plain.ab.power).toBeCloseTo(0.9);
    expect(plain.w.monsters[0].hp).toBe(plain.w.monsters[0].maxHp);
    expect(wide.w.monsters[0].hp).toBeLessThan(wide.w.monsters[0].maxHp);
  });

  it('Heavy: its hits stagger', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('heavy')] } });
    press(w, 0);
    run(w, 0.5);
    expect(w.monsters[0].status.staggerUntil).toBeGreaterThan(0);
  });

  it('Linger: a zone where the move lands, for its seconds', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('linger')] } });
    press(w, 0);
    run(w, 0.5);
    const zone = w.zones.find((z) => z.owner === 'hero' && z.ability);
    expect(zone && zone.until - zone.born).toBeCloseTo(2.5);
  });

  it('Leech: its hits heal a share of their damage', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('leech', 5)] } });
    w.hero.hp = w.hero.stats.maxHp / 2;
    const events = [...press(w, 0), ...run(w, 0.5)];
    const dealt = skillHits(events).reduce((a, e) => a + e.amount, 0);
    const healed = events.reduce((a, e) => a + (e.kind === 'heal' ? e.amount : 0), 0);
    expect(dealt).toBeGreaterThan(0);
    expect(healed).toBeCloseTo(dealt * (w.hero.stats.lifesteal + 0.06));
  });

  it('a Bolt spawned piercing never bursts at the end of its flight, its count spent or not', () => {
    const w = world([dummy(13, 33)], { primary: { runes: [R('pierce', 1)] } });
    const events = [...press(w, 0), ...until(w, 'hit')];
    // It burst on the foe, passed it, and flies on: its count is spent.
    expect(w.projectiles.filter((p) => p.form === 'bolt')).toHaveLength(1);
    events.push(...run(w, 1.5));
    expect(w.projectiles).toHaveLength(0);
    expect(events.filter((e) => e.kind === 'explode')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 10 failed (10): `AssertionError: expected [] to deeply equal [ { id: 'chain', tier: 3 }, …(1) ]` (the runes listed), `expected 1 to be close to 1.3` (Heavy's power), `expected [ true, false, false, false ] to deeply equal [ true, true, true, false ]` (Pierce), `expected false to be 3` (Chain), `expected 1 to be close to 1.4` (Widen), `expected 0 to be greater than 0` (Heavy's stagger), `expected undefined to be close to 2.5` (Linger), `expected +0 to be close to 0.43848` (Leech), and the spawned-piercing test's `expected [] to have a length of 1 but got +0`: no rune acts yet.

- [ ] **Step 3: Merge the runes in `resolveAbility`**

In `packages/engine/src/arpg/abilities/resolve.ts`:

Replace:

```ts
import { DEFAULT_FORMS, weaponString } from '../../loot/moveset.js';
```

with:

```ts
import { DEFAULT_FORMS, weaponString } from '../../loot/moveset.js';
import { runeKnobs } from '../../loot/runes.js';
```

Replace the lines from `const knobs = mergeKnobs(` up to (not including) `const w = moveWeight(bal, move.kind, stage);` with:

```ts
  const own = [
    ...move.elements.map((e) => data.elementTraits[e].knobs),
    fusion?.knobs ?? {},
    ...legendary,
  ];
  // Its runes merge last. A Pierce on a move that already passes every foe (an Earth Bolt)
  // would do nothing, so it's left out, trade-off and all: dormant, like a rune that doesn't fit.
  const socketed = runeKnobs(registry, move.runes, { form: move.form });
  const pierces = mergeKnobs(...own).pierce === Infinity;
  const acts = socketed.knobs.map((k) => !(pierces && k.pierce !== undefined));
  const knobs = mergeKnobs(...own, ...socketed.knobs.filter((_, i) => acts[i]));
```

Replace:

```ts
    runes: [],
```

with:

```ts
    runes: socketed.active.filter((_, i) => acts[i]),
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 10 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1476 tests pass and 14 are todo (1490) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/abilities/resolve.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): runes merge into the move they sit on, after its elements and legendaries" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: Basic blows carry their runes; a changed socket is a changed chain; followBasic keeps them

`computeHeroStats` gives each blow its active runes (`runeKnobs` on `{ weapon, kind, explode }`: a Linger acts on heavy and hold blows only, a Pierce does nothing on a row that bursts) merged into `HeroBlow.knobs` (the shared `NEUTRAL` without any), and lists them in `HeroBlow.runes`. `world.ts`'s `sameChain` compares each move's raw sockets, so a socket opened or a rune changed refreshes the slot as any change does (the Training Grounds' hot swap). The Training Grounds' `followBasic`, resetting a default basic chain to a new weapon's default, keeps each blow's sockets by position, minus runes that don't fit the new weapon.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/resolve.ts` (CRLF, never format)
- Modify: `packages/engine/src/arpg/world.ts`
- Modify: `packages/engine/src/delve/hero-stats.ts` (cross-area: see Cross-area needs, 1)
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Replace the lines from `import { describe, it, expect } from 'vitest';` up to (not including) `// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing` with:

```ts
import { describe, it, expect } from 'vitest';
import { NEUTRAL, defaultBasic, followBasic } from '../src/arpg/abilities/resolve.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import {
  STEP,
  arena,
  dummy,
  gear,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  type ArenaOpts,
} from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('basic blows carry their runes (computeHeroStats)', () => {
  const blowsOf = (baseId: string, basic: Blow[]) =>
    computeHeroStats({ weapon: gear('fire', 'weapon', baseId) }, registry, { basic }).weapon.blows;

  it("takes the runes that fit the weapon and act on the blow's kind, merged into its knobs", () => {
    const [light, heavy] = blowsOf('sword', [
      { kind: 'light', element: 'fire', runes: [R('linger'), R('chain')] },
      { kind: 'heavy', element: 'fire', runes: [R('linger'), R('split'), R('chain')] },
    ]);
    // Linger acts on heavy and hold blows only; Split doesn't fit a sword.
    expect(light.runes).toEqual([R('chain')]);
    expect(light.knobs.zone).toBeNull();
    expect(heavy.runes).toEqual([R('linger'), R('chain')]);
    expect(heavy.knobs.zone).toEqual({ seconds: 2.5, tickPower: 0.2 });
    expect(heavy.knobs.chain).toBe(2);
    expect(blowsOf('sword', [{ kind: 'light', element: 'fire' }])[0].knobs).toEqual(NEUTRAL);
  });

  it("leaves a Pierce dormant on a staff's rows that burst", () => {
    const [light, medium] = blowsOf('staff', [
      { kind: 'light', element: 'fire', runes: [R('pierce')] },
      { kind: 'medium', element: 'fire', runes: [R('pierce')] },
    ]);
    expect(light.runes).toEqual([R('pierce')]);
    expect(light.knobs.pierce).toBe(3);
    expect(medium.runes).toEqual([]);
    expect(medium.knobs.pierce).toBe(0);
  });
});

describe('a chain whose sockets change is a changed chain (refreshWorldHero)', () => {
  it('drops the slot’s wind-up when a socket opens or a rune changes; the same sockets keep it', () => {
    const chains = (runes: (RuneRef | null)[]) => ({
      primary: {
        moves: [
          { kind: 'heavy' as const, form: 'bolt' as const, elements: ['fire' as const], runes },
        ],
        payment: 'mana' as const,
      },
    });
    const w = world([dummy(13, 30)], { chains: chains([null]) });
    pressOnly(w, 0);
    expect(w.hero.windup).not.toBeNull();
    refreshWorldHero(registry, w, w.hero.stats, chains([null]));
    expect(w.hero.windup).not.toBeNull();
    refreshWorldHero(registry, w, w.hero.stats, chains([null, null]));
    expect(w.hero.windup).toBeNull();
    pressOnly(w, 0);
    refreshWorldHero(registry, w, w.hero.stats, chains([R('chain'), null]));
    expect(w.hero.windup).toBeNull();
  });
});

describe("the Training Grounds' followBasic keeps blow runes", () => {
  const fire = (weaponBaseId: string) => ({
    weaponBaseId,
    primary: 'fire' as const,
    secondary: null,
  });

  it('a reset to the new default keeps each blow’s sockets by position, minus runes that don’t fit', () => {
    const basic: Blow[] = defaultBasic(registry, 'sword', 'fire').map((b, i) =>
      i === 0 ? { ...b, runes: [R('chain'), null] } : i === 2 ? { ...b, runes: [R('widen')] } : b,
    );
    expect(followBasic(registry, basic, fire('sword'), fire('bow'))).toEqual([
      { kind: 'light', element: 'fire', runes: [R('chain'), null] },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'fire', runes: [null] },
    ]);
    // The dagger's chain is a blow longer: its fourth has none.
    expect(followBasic(registry, basic, fire('sword'), fire('dagger'))[3]).toEqual({
      kind: 'heavy',
      element: 'fire',
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 4 failed and 10 passed (14): `expected [] to deeply equal [ { id: 'chain', tier: 3 } ]` (a blow's runes), `expected [] to deeply equal [ { id: 'pierce', tier: 3 } ]` (the staff), `expected { slot: +0, aim: null, …(8) } to be null` (the wind-up a socket change drops), and `expected [ …(3) ] to deeply equal [ { kind: 'light', …(2) }, …(2) ]` (`followBasic`).

- [ ] **Step 3: Blows' runes, the raw sockets and followBasic**

In `packages/engine/src/arpg/abilities/resolve.ts`:

Replace:

```ts
import { runeKnobs } from '../../loot/runes.js';
```

with:

```ts
import { runeFits, runeKnobs } from '../../loot/runes.js';
import type { RuneRef } from '../../types/rune.js';
```

Replace:

```ts
 * leaves the pair, each blow takes its element's heir (`roleHeir`); else it
 * stays as it is.
 */
export function followBasic(
  registry: DataRegistry,
  basic: Blow[],
  before: BasicLoadout,
  after: BasicLoadout,
): Blow[] {
  if (isDefaultBasic(registry, basic, before))
    return defaultBasic(registry, after.weaponBaseId, after.primary, after.secondary);
```

with:

```ts
 * leaves the pair, each blow takes its element's heir (`roleHeir`); else it
 * stays as it is. A reset to the default keeps each old blow's sockets on the
 * new blow at its position, a rune that doesn't fit the new weapon taken out
 * (its socket stays open); a blow past the old chain's end has none.
 */
export function followBasic(
  registry: DataRegistry,
  basic: Blow[],
  before: BasicLoadout,
  after: BasicLoadout,
): Blow[] {
  if (isDefaultBasic(registry, basic, before)) {
    const weapon = after.weaponBaseId;
    return defaultBasic(registry, weapon, after.primary, after.secondary).map((b, i) => {
      const runes = basic[i]?.runes;
      if (!runes) return b;
      const fits = (r: RuneRef) => {
        const def = registry.findRune(r.id);
        return !!def && runeFits(def, { weapon, kind: b.kind });
      };
      return { ...b, runes: runes.map((r) => (r && fits(r) ? r : null)) };
    });
  }
```

In `packages/engine/src/arpg/world.ts`:

Replace:

```ts
import type { ManaType } from '../types/mana.js';
```

with:

```ts
import type { ManaType } from '../types/mana.js';
import type { RuneRef } from '../types/rune.js';
```

Replace:

```ts
/** Each slot's chain resolved, by slot; null for a skill left out. */
function resolveAll(
  registry: DataRegistry,
  chains: Partial<Pick<Chains, AbilitySlot>>,
  stats: HeroStats,
): (ResolvedChain | null)[] {
  return ABILITY_SLOTS.map((slot) => {
    const chain = chains[slot];
    return chain ? resolveChain(registry, stats, slot, chain) : null;
  });
}
```

with:

```ts
/**
 * The chain each hero chain was resolved from: `sameChain` compares its raw sockets, which the
 * resolved moves don't keep (their `runes` drop empty and dormant sockets).
 */
// ponytail: a side table, since the contract gives ResolvedChain no field for the raw chain.
const SOURCES = new WeakMap<ResolvedChain, Chain>();

/** Each slot's chain resolved, by slot; null for a skill left out. */
function resolveAll(
  registry: DataRegistry,
  chains: Partial<Pick<Chains, AbilitySlot>>,
  stats: HeroStats,
): (ResolvedChain | null)[] {
  return ABILITY_SLOTS.map((slot) => {
    const chain = chains[slot];
    if (!chain) return null;
    const resolved = resolveChain(registry, stats, slot, chain);
    SOURCES.set(resolved, chain);
    return resolved;
  });
}
```

Replace:

```ts
/** Whether a resolved chain is `b` (both absent counts as the same). */
function sameChain(a: ResolvedChain | null, b: Chain | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.payment === b.payment &&
    a.moves.length === b.moves.length &&
    a.moves.every(
      (m, i) =>
        m.kind === b.moves[i].kind &&
        m.form.id === b.moves[i].form &&
        m.elements.join() === b.moves[i].elements.join(),
    )
  );
}
```

with:

```ts
/** Whether a resolved chain is `b` (both absent count as the same), raw sockets included. */
function sameChain(a: ResolvedChain | null, b: Chain | undefined): boolean {
  if (!a || !b) return !a && !b;
  const source = SOURCES.get(a);
  return (
    a.payment === b.payment &&
    a.moves.length === b.moves.length &&
    a.moves.every(
      (m, i) =>
        m.kind === b.moves[i].kind &&
        m.form.id === b.moves[i].form &&
        m.elements.join() === b.moves[i].elements.join() &&
        sameSockets(source?.moves[i]?.runes ?? [], b.moves[i].runes ?? []),
    )
  );
}

/** The same sockets: as many, each empty in both or holding the same rune at the same tier. */
function sameSockets(a: readonly (RuneRef | null)[], b: readonly (RuneRef | null)[]): boolean {
  return a.length === b.length && a.every((r, i) => r?.id === b[i]?.id && r?.tier === b[i]?.tier);
}
```

In `packages/engine/src/delve/hero-stats.ts`:

Replace:

```ts
  holdFull,
  moveBeat,
```

with:

```ts
  holdFull,
  mergeKnobs,
  moveBeat,
```

Replace:

```ts
import { heroChains, movesetTransfer } from '../loot/moveset.js';
```

with:

```ts
import { heroChains, movesetTransfer } from '../loot/moveset.js';
import { runeKnobs } from '../loot/runes.js';
```

Replace the lines from `const blows = chain.map((b) => ({` up to (not including) `const weapon: HeroWeapon = armed?.attack` with:

```ts
  const blows = chain.map((b) => {
    const row = feel[b.kind];
    // Its runes: those that fit the weapon and act on its kind (a Pierce does nothing on a row
    // that bursts). Without any, it keeps the shared NEUTRAL.
    const on = { weapon: armed?.id ?? null, kind: b.kind, explode: (row.explode ?? 0) > 0 };
    const socketed = runeKnobs(registry, b.runes, on);
    return {
      ...row,
      kind: b.kind,
      element: b.element,
      attunePower: primary ? 1 + perAttune * attunement[b.element] : 1,
      knobs: socketed.knobs.length > 0 ? mergeKnobs(...socketed.knobs) : NEUTRAL,
      runes: socketed.active,
    };
  });
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 14 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1480 tests pass and 14 are todo (1494) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/world.ts src/delve/hero-stats.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/arpg/world.ts packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): basic blows carry their runes; a socket change is a changed chain; followBasic keeps blow runes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The blow, and Quick

### Task 3: `landBlow`: a blow's damage in one place, with its knobs

The damage half of `strike` moves into `landBlow(ctx, blow, kind, dir, powerMult, o)`, which `strike` calls now and a blow's echo calls in Task 10. It reads the blow's knobs: `power` (Heavy and every trade-off; `blowNumbers` too), `applies` (Heavy's stagger), `area` (Widen: a melee blow's reach × area, its arc unchanged), the pierce count (a shot's `pierceLeft` is the weapon's, `Infinity` for a bow, plus the blow's), and the hit-time knobs through `knobHitOpts`, which this task builds (wave 0's stub): `leech` (Leech), `catalyst` and `manaOnHit` (read in Tasks 11 and 12). Ability hits (`hitOpts`) and Armor's strike-back take `knobHitOpts` in place of their `leech: lifesteal`. A basic shot carries its blow's knobs (`Projectile.knobs`), and its hit (in `step.ts`, and `burstShot`'s) passes them on. Twin Fang's extra hit and shot carry none.

**Files:**
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/src/arpg/abilities/impact.ts`
- Modify: `packages/engine/src/arpg/abilities/defend.ts`
- Modify: `packages/engine/src/arpg/step.ts`
- Modify: `packages/engine/src/arpg/abilities/resolve.ts` (CRLF, never format)
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Replace the lines from `import { describe, it, expect } from 'vitest';` up to (not including) `// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing` with:

```ts
import { describe, it, expect } from 'vitest';
import { NEUTRAL, blowNumbers, defaultBasic, followBasic } from '../src/arpg/abilities/resolve.js';
import { landBlow } from '../src/arpg/basic.js';
import { makeCtx } from '../src/arpg/combat.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import {
  STEP,
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  type ArenaOpts,
} from './fixtures/arena.js';
```

Append at the end of the file:

```ts
const SWORD: EquippedGear = { weapon: gear('fire') };
const light = (runes: (RuneRef | null)[] = []): Blow => ({ kind: 'light', element: 'fire', runes });
/** The basic hits in `events`. */
const basicHits = (events: ArpgEvent[]) =>
  events.flatMap((e) => (e.kind === 'hit' && e.source === 'basic' ? [e] : []));

/** A world whose hero swings `basic` with `equipped` (the fixture sword by default) at sturdy foes. */
function blowWorld(
  basic: Blow[],
  foes: Partial<MonsterEntity>[] = [dummy(13, 34.5)],
  equipped: EquippedGear = SWORD,
): ArpgWorld {
  const w = arena(foes, { equipped });
  w.hero.stats = computeHeroStats(equipped, registry, { basic });
  return w;
}

describe("a blow's runes where it lands (landBlow)", () => {
  it('Heavy: a blow hits harder at its tier and staggers', () => {
    const blowOf = (runes: RuneRef[]) => {
      const w = blowWorld([light(runes)]);
      return { w, hit: basicHits(firstBlow(w))[0] };
    };
    const plain = blowOf([]);
    const heavy = blowOf([R('heavy')]);
    expect(heavy.hit.amount / plain.hit.amount).toBeCloseTo(1.3);
    expect(plain.w.monsters[0].status.staggerUntil).toBe(0);
    expect(heavy.w.monsters[0].status.staggerUntil).toBeGreaterThan(0);
    const hitOf = (w: ArpgWorld) =>
      blowNumbers(w.hero.stats, bal, w.hero.stats.weapon.blows[0]).hit;
    expect(hitOf(heavy.w) / hitOf(plain.w)).toBeCloseTo(1.3);
  });

  it('Widen: a melee blow reaches further, its arc unchanged', () => {
    const reaches = (runes: RuneRef[]) => {
      const w = blowWorld([light(runes)], [dummy(13, 33.4)]);
      landBlow(makeCtx(registry, w, []), w.hero.stats.weapon.blows[0], 'light', { x: 0, y: -1 }, 1);
      return w.monsters[0].hp < w.monsters[0].maxHp;
    };
    expect(reaches([])).toBe(false);
    expect(reaches([R('widen')])).toBe(true);
  });

  it('Leech: a blow heals a share of its damage', () => {
    const w = blowWorld([light([R('leech', 5)])]);
    w.hero.hp = w.hero.stats.maxHp / 2;
    const events = firstBlow(w);
    const dealt = basicHits(events).reduce((a, e) => a + e.amount, 0);
    const healed = events.reduce((a, e) => a + (e.kind === 'heal' ? e.amount : 0), 0);
    expect(dealt).toBeGreaterThan(0);
    expect(healed).toBeCloseTo(dealt * (w.hero.stats.lifesteal + 0.06));
  });

  it("Pierce: a wand's shot passes that many foes; on a staff's row that bursts it does nothing", () => {
    const line = [dummy(13, 33), dummy(13, 31), dummy(13, 29), dummy(13, 27)];
    const shoot = (baseId: string, blow: Blow) => {
      const w = blowWorld([blow], line, { weapon: gear('fire', 'weapon', baseId) });
      firstBlow(w);
      w.hero.nextAttackAt = 1e9;
      run(w, 1);
      return w.monsters.map((m) => m.hp < m.maxHp);
    };
    expect(shoot('wand', light([R('pierce', 2)]))).toEqual([true, true, true, false]);
    expect(shoot('wand', light())).toEqual([true, false, false, false]);
    const medium: Blow = { kind: 'medium', element: 'fire', runes: [R('pierce', 2)] };
    expect(shoot('staff', medium)).toEqual([true, false, false, false]);
  });

  it("a shot blow's shot carries them: Heavy's power and stagger, Leech's heal", () => {
    const WAND: EquippedGear = { weapon: gear('fire', 'weapon', 'wand') };
    const shot = (runes: RuneRef[]) => {
      const w = blowWorld([light(runes)], [dummy(13, 30)], WAND);
      w.hero.hp = w.hero.stats.maxHp / 2;
      const events = [...firstBlow(w), ...until(w, 'hit')];
      const healed = events.reduce((a, e) => a + (e.kind === 'heal' ? e.amount : 0), 0);
      return { w, hit: basicHits(events)[0], healed };
    };
    const plain = shot([]);
    const heavy = shot([R('heavy')]);
    expect(heavy.hit.amount / plain.hit.amount).toBeCloseTo(1.3);
    expect(heavy.w.monsters[0].status.staggerUntil).toBeGreaterThan(0);
    const leech = shot([R('leech', 5)]);
    expect(leech.healed).toBeCloseTo(leech.hit.amount * (leech.w.hero.stats.lifesteal + 0.06));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 5 failed and 14 passed (19): `expected 1 to be close to 1.3` (Heavy, melee and shot), `TypeError: (0 , landBlow) is not a function` (Widen), `expected +0 to be close to 0.288` (Leech) and `expected [ true, false, false, false ] to deeply equal [ true, true, true, false ]` (the wand's Pierce).

- [ ] **Step 3: Write `landBlow` and `knobHitOpts`**

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
import { HOLD_STAGE_KINDS } from '../types/ability.js';
import type { ComboStepDef, DelveBalance, HeroWeapon } from '../types/delve.js';
```

with:

```ts
import { HOLD_STAGE_KINDS, type MoveKind } from '../types/ability.js';
import type { ComboStepDef, DelveBalance, HeroBlow, HeroWeapon } from '../types/delve.js';
```

Replace:

```ts
import { surging } from './abilities/defend.js';
```

with:

```ts
import { surging } from './abilities/defend.js';
import { knobHitOpts } from './abilities/impact.js';
```

Replace:

```ts
  h.lastBasicAt = world.t;

  const surge = surging(ctx);
```

with:

```ts
  h.lastBasicAt = world.t;
```

Replace the lines from `const element = blow.element;` up to (not including) `function blowStep(ctx: SimCtx, s: ComboStepDef, dir: Vec, steer: Vec): void {` with:

```ts
  const element = blow.element;
  const twinPct = (h.stats.legendaries.twin_fang ?? 0) / 100;
  const dir = sw.dir;
  // Mana only for an attack at something: a blow that connects, or a shot with a foe in range.
  const landed = landBlow(ctx, blow, kind, dir, 1, {
    twin: last ? twinPct : 0,
    targetId: sw.targetId,
  });
  blowStep(ctx, s, dir, steer);

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
    moveKind: kind,
    dir,
  });
  if (landed) h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
  // A held blow takes its time from its stage's row; its startup was spent holding. A tap
  // (struck on the tick it reached its strike point) keeps a medium blow's timing.
  const cycle = stage === null ? sw.cycle : (h.stats.attackInterval * s.time) / haste(ctx);
  if (stage !== null && world.t > sw.held! + 1e-9)
    h.nextAttackAt = world.t + cycle * (1 - s.startup);
  if (sw.committed)
    h.recoverUntil = Math.min(h.nextAttackAt, world.t + cycle * bal.feel.basicRecovery);
}

/**
 * A blow's damage from where the hero stands now, along `dir`, struck as `kind`
 * (a held blow's stage's: its row follows), at `powerMult` × its power. A melee
 * blow hits every foe in its reach (× its `area`) and arc, the swing's
 * `targetId` whatever its angle, with one crit roll; a shot blow fires its shot.
 * Every hit carries the blow's knobs (`knobHitOpts`). `twin`: Twin Fang's share
 * on the chain's last blow (its extra hit or shot carries no runes). Returns
 * whether it landed: a melee blow that connected, or a shot with a foe in range.
 */
export function landBlow(
  ctx: SimCtx,
  blow: HeroBlow,
  kind: MoveKind,
  dir: Vec,
  powerMult: number,
  o: { twin?: number; targetId?: number | null } = {},
): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const w = h.stats.weapon;
  const s = kind === blow.kind ? blow : w.feel[kind];
  const k = blow.knobs;
  const twin = o.twin ?? 0;
  const surge = surging(ctx);
  const element = blow.element;
  const unit = h.stats.weaponDamage * h.stats.damageMult * blow.attunePower;
  const base = unit * s.power * k.power * powerMult;
  // Every blow applies its element's stacks, by its kind (a Surge's statuses ride along).
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (!applies.includes(BASIC_STATUS[element])) applies.push(BASIC_STATUS[element]);
  if (s.stagger && !applies.includes('stagger')) applies.push('stagger');
  for (const a of k.applies) if (!applies.includes(a)) applies.push(a);
  const stacks = bal.stacks.basicByKind[kind];
  // An Earth blow or an Earth Surge's statuses: its stagger adds Earth stacks.
  const rattles = element === 'earth' || !!surge?.elements.includes('earth');
  const knobbed = knobHitOpts(k);

  let landed = w.kind !== 'melee' && !!nearestMonster(ctx, h.x, h.y, w.range);
  if (w.kind === 'melee') {
    const crit = world.rng.next() < h.stats.critChance;
    const arc = s.arc ?? w.arc;
    const reach = (w.range + (s.reach ?? 0)) * k.area;
    const halfArc = (arc * Math.PI) / 360;
    const kb = s.knockback ? { knockback: s.knockback, kbFrom: { x: h.x, y: h.y } } : {};
    for (const m of alive(ctx)) {
      if (dist(h.x, h.y, m.x, m.y) - m.radius > reach) continue;
      if (
        arc < 360 &&
        m.id !== o.targetId &&
        angleBetween(dir, dirTo(h.x, h.y, m.x, m.y)) > halfArc
      )
        continue;
      landed = true;
      hitMonster(ctx, m, base, element, {
        source: 'basic',
        crit,
        applies,
        heft: s.heft,
        rattles,
        stacks,
        ...kb,
        ...knobbed,
      });
      // Twin Fang: today's finisher value (×1.5) on melee; it applies no stacks and pairs
      // nothing (it would only react with the last blow's own fresh stacks).
      if (twin > 0)
        hitMonster(ctx, m, unit * 1.5 * twin, element, {
          source: 'basic',
          crit,
          heft: s.heft,
          stacks: 0,
          noReact: true,
        });
    }
  } else {
    const size = s.size ?? 1;
    const speed = w.speed * (s.speed ?? 1);
    const weaponPierce = w.pierce ? Infinity : 0;
    for (let i = 0; i < (twin > 0 ? 2 : 1); i++) {
      const spread = i === 0 ? 0 : 0.12;
      const d = {
        x: dir.x * Math.cos(spread) - dir.y * Math.sin(spread),
        y: dir.x * Math.sin(spread) + dir.y * Math.cos(spread),
      };
      const pierceLeft = i === 0 ? weaponPierce + k.pierce : weaponPierce;
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
        // Twin Fang's extra shot: today's value (×1.0), never an explosion, no stacks and no pairing.
        damage: i === 0 ? base : unit * twin,
        element,
        pierce: pierceLeft > 0,
        pierceLeft,
        maxDist: w.range + 1.5,
        explodeRadius: i === 0 ? (s.explode ?? 0) : 0,
        applies: i === 0 ? applies : [],
        knockback: 0,
        heft: s.heft,
        rattles,
        stacks: i === 0 ? stacks : 0,
        noReact: i === 1,
        ...(i === 0 ? { knobs: k } : {}),
      });
    }
  }
  return landed;
}

/**
 * A blow's step, from its strike over `stepSeconds`: its step back (a negative
 * `move`) and hop away from `dir`, and its side step square to it, as one push
 * with no stop. The side is the steering's when its part square to `dir` is at
 * least `sideSteer`, else the weapon's `sway`: `alternate` flips from the
 * last side taken, `orbit` keeps it. See the weapon flow spec.
 */
```

Replace:

```ts
      noReact: p.noReact,
    });
  }
}
```

with:

```ts
      noReact: p.noReact,
      ...(p.knobs ? knobHitOpts(p.knobs) : {}),
    });
  }
}
```

In `packages/engine/src/arpg/abilities/impact.ts`:

Replace:

```ts
    kbFrom: from,
    leech: k.lifesteal,
```

with:

```ts
    kbFrom: from,
    ...knobHitOpts(k),
```

Replace:

```ts
export function knobHitOpts(_k: Knobs): Pick<HitOpts, 'leech' | 'catalyst' | 'manaOnHit'> {
  throw new Error('not built yet');
```

with:

```ts
export function knobHitOpts(k: Knobs): Pick<HitOpts, 'leech' | 'catalyst' | 'manaOnHit'> {
  return { leech: k.lifesteal, catalyst: k.catalyst, manaOnHit: k.manaOnHit };
```

In `packages/engine/src/arpg/abilities/defend.ts`:

Replace:

```ts
import { abilityHit, impact } from './impact.js';
```

with:

```ts
import { abilityHit, impact, knobHitOpts } from './impact.js';
```

Replace:

```ts
          leech: ab.knobs.lifesteal,
```

with:

```ts
          ...knobHitOpts(ab.knobs),
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
import { impact } from './abilities/impact.js';
```

with:

```ts
import { impact, knobHitOpts } from './abilities/impact.js';
```

Replace:

```ts
          noReact: p.noReact,
        });
```

with:

```ts
          noReact: p.noReact,
          ...(p.knobs ? knobHitOpts(p.knobs) : {}),
        });
```

In `packages/engine/src/arpg/abilities/resolve.ts`:

Replace:

```ts
    hit: stats.weaponDamage * stats.damageMult * blow.attunePower * blow.power,
```

with:

```ts
    hit: stats.weaponDamage * stats.damageMult * blow.attunePower * blow.power * blow.knobs.power,
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 19 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1485 tests pass and 14 are todo (1499) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/basic.ts src/arpg/abilities/impact.ts src/arpg/abilities/defend.ts src/arpg/step.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/basic.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/abilities/defend.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/abilities/resolve.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): landBlow, a blow's damage in one place, with its knobs; knobHitOpts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Quick and Heavy: the `quick` knob

An ability's cooldown takes `quick.cooldown` (a charge payment's lockout too), its conjure and channel `quick.windup`; its beat already takes `quick.beat` through wave 0's `moveBeat`. A hold's charge time is untouched. A blow's swing: `cycle = base × quick.beat` and `startup = min(cycle, base × s.startup × quick.windup)`, the base being today's `attackInterval × s.time ÷ haste`; `strike`'s recompute of a held blow's cycle takes the same rule, and its rest after the strike is the cycle less that startup.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/resolve.ts` (CRLF, never format)
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Replace the lines from `import { describe, it, expect } from 'vitest';` up to (not including) `// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing` with:

```ts
import { describe, it, expect } from 'vitest';
import { NEUTRAL, blowNumbers, defaultBasic, followBasic } from '../src/arpg/abilities/resolve.js';
import { landBlow } from '../src/arpg/basic.js';
import { makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import {
  STEP,
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  type ArenaOpts,
} from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('Quick and Heavy (the quick knob)', () => {
  /** Press the Primary (a medium Fire Bolt with `runes`) and land it: its wind-up, beat and cooldown. */
  const cast = (runes: RuneRef[], opts: ArenaOpts = {}) => {
    const w = world([dummy(13, 30)], { primary: { runes }, ...opts });
    pressOnly(w, 0);
    const windup = w.hero.windup!.until - w.hero.windup!.start;
    press(w, 0);
    return { windup, beat: w.hero.beatUntil[0] - w.t, cooldown: moveOf(w, 0).cooldown };
  };

  it('an ability: Quick shortens its beat and cooldown, Heavy lengthens its beat and wind-up', () => {
    const plain = cast([]);
    const quick = cast([R('quick')]);
    const heavy = cast([R('heavy')]);
    expect(quick.beat / plain.beat).toBeCloseTo(0.8);
    expect(quick.cooldown / plain.cooldown).toBeCloseTo(0.8);
    expect(quick.windup).toBeCloseTo(plain.windup);
    expect(heavy.beat / plain.beat).toBeCloseTo(1.2);
    expect(heavy.windup / plain.windup).toBeCloseTo(1.2);
    expect(heavy.cooldown).toBeCloseTo(plain.cooldown);
    // A cast payment's channel and a charge payment's lockout scale too.
    const castPaid = (runes: RuneRef[]) =>
      moveOf(world([], { primary: { payment: 'cast', runes } }), 0);
    expect(castPaid([R('heavy')]).castTime / castPaid([]).castTime).toBeCloseTo(1.2);
    const nova = (runes: RuneRef[]) => moveOf(world([], { ultimate: { runes } }), 2).cooldown;
    expect(nova([R('quick')])).toBeCloseTo(bal.abilities.chargeLockout * 0.8);
  });

  it("leaves a hold's charge time alone", () => {
    const hold = (runes: RuneRef[]) => {
      const w = world([dummy(13, 30)], { primary: { kind: 'hold', runes } });
      stepWorld(registry, w, { move: { x: 0, y: 0 }, holding: 0 }, STEP);
      return w.hero.hold!.full;
    };
    expect(hold([R('heavy')])).toBe(hold([]));
  });

  it('a blow (melee or shot): its cycle × the beat, its startup (from the base cycle) × the wind-up', () => {
    for (const baseId of ['sword', 'wand']) {
      const swing = (runes: RuneRef[]) => {
        const w = blowWorld([light(runes)], [dummy(13, 34.5)], {
          weapon: gear('fire', 'weapon', baseId),
        });
        run(w, STEP);
        const sw = w.hero.swing!;
        return { cycle: sw.cycle, startup: sw.strikeAt - sw.start };
      };
      const plain = swing([]);
      const quick = swing([R('quick')]);
      const heavy = swing([R('heavy')]);
      expect(quick.cycle / plain.cycle).toBeCloseTo(0.8);
      expect(quick.startup).toBeCloseTo(plain.startup);
      expect(heavy.cycle / plain.cycle).toBeCloseTo(1.2);
      expect(heavy.startup / plain.startup).toBeCloseTo(1.2);
    }
  });

  it("a held blow's recomputed cycle takes the same rule: the rest after its strike", () => {
    /** Hold a manual hold blow past full charge, let go, and measure the rest after it strikes. */
    const rest = (runes: RuneRef[]) => {
      const w = blowWorld([{ kind: 'hold', element: 'fire', runes }]);
      const events: ArpgEvent[] = [];
      for (let i = 0; i < 300 && !events.some((e) => e.kind === 'basic'); i++) {
        const attack = w.t < 1.5;
        events.push(...stepWorld(registry, w, { move: { x: 0, y: 0 }, attack }, STEP));
      }
      return w.hero.nextAttackAt - w.t;
    };
    const w = blowWorld([{ kind: 'hold', element: 'fire' }]);
    const row = w.hero.stats.weapon.feel.hold;
    const base = w.hero.stats.attackInterval * row.time;
    expect(rest([])).toBeCloseTo(base * (1 - row.startup));
    expect(rest([R('quick')])).toBeCloseTo(base * 0.8 - base * row.startup);
    expect(rest([R('heavy')])).toBeCloseTo((base - base * row.startup) * 1.2);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 3 failed and 20 passed (23): `expected 1 to be close to 0.8` (the ability's cooldown; its beat already passes through `moveBeat`), `expected 1 to be close to 0.8` (a blow's cycle) and `expected 0.41600000000000015 to be close to 0.20800000000000007` (the held blow's rest). The hold's charge test passes already.

- [ ] **Step 3: Fold `quick` into the numbers and the swing**

In `packages/engine/src/arpg/abilities/resolve.ts`:

Replace:

```ts
  const F = bal.feel;
  const wi = w + 2;
  const conjure = F.conjure[wi] * F.conjureSlot[slot];
  const channel = cast ? s.castTime * (1 + W.castTime * w) : 0;
```

with:

```ts
  const F = bal.feel;
  const wi = w + 2;
  // Quick and Heavy (`quick`): the wind-up and the cooldown scale here, the beat in `moveBeat`.
  const q = knobs.quick;
  const conjure = F.conjure[wi] * F.conjureSlot[slot] * q.windup;
  const channel = cast ? s.castTime * (1 + W.castTime * w) * q.windup : 0;
```

Replace:

```ts
    cooldown:
      payment === 'charge'
        ? ab.chargeLockout
        : s.cooldown * (1 + W.cooldown * w) * stats.cooldownMult,
```

with:

```ts
    cooldown:
      (payment === 'charge'
        ? ab.chargeLockout
        : s.cooldown * (1 + W.cooldown * w) * stats.cooldownMult) * q.cooldown,
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
  const s = manual && blow.kind === 'hold' ? w.feel.medium : blow;
  const cycle = (h.stats.attackInterval * s.time) / haste(ctx);
  const startup = cycle * s.startup;
```

with:

```ts
  const s = manual && blow.kind === 'hold' ? w.feel.medium : blow;
  // Quick and Heavy (`quick`): the cycle × its beat; the startup, from the base cycle, × its
  // wind-up, at most the cycle.
  const q = blow.knobs.quick;
  const base = (h.stats.attackInterval * s.time) / haste(ctx);
  const cycle = base * q.beat;
  const startup = Math.min(cycle, base * s.startup * q.windup);
```

Replace:

```ts
  // A held blow takes its time from its stage's row; its startup was spent holding. A tap
  // (struck on the tick it reached its strike point) keeps a medium blow's timing.
  const cycle = stage === null ? sw.cycle : (h.stats.attackInterval * s.time) / haste(ctx);
  if (stage !== null && world.t > sw.held! + 1e-9)
    h.nextAttackAt = world.t + cycle * (1 - s.startup);
```

with:

```ts
  // A held blow takes its time from its stage's row (by the swing's `quick` rule); its startup
  // was spent holding. A tap (struck on the tick it reached its strike point) keeps a medium
  // blow's timing.
  const q = blow.knobs.quick;
  const cycle =
    stage === null ? sw.cycle : ((h.stats.attackInterval * s.time) / haste(ctx)) * q.beat;
  if (stage !== null && world.t > sw.held! + 1e-9)
    h.nextAttackAt = world.t + cycle * Math.max(0, 1 - (s.startup * q.windup) / q.beat);
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 23 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1489 tests pass and 14 are todo (1503) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/basic.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/arpg/basic.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): Quick and Heavy: cooldown, wind-up and beat; a blow's cycle and startup" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Saturate and Multi-shot

### Task 5: Saturate: the `stacksBonus` knob

`ResolvedAbility.stacks` (a direct hit's) and a blow's stacks (`landBlow`, `blowNumbers`) add `stacksBonus`. Ticks, jumps and splashes keep a tick's stacks.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/resolve.ts` (CRLF, never format)
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Append at the end of the file:

```ts
describe('Saturate (the stacksBonus knob)', () => {
  it("an ability: its direct hits apply more stacks; its jumps keep a tick's", () => {
    const stacksOn = (runes: RuneRef[]) => {
      const w = world([dummy(13, 30), dummy(16, 30)], { primary: { runes } });
      press(w, 0);
      run(w, 1);
      return w.monsters.map((m) => m.status.stacks.fire);
    };
    expect(stacksOn([R('chain')])).toEqual([2, 1]);
    expect(stacksOn([R('chain'), R('saturate')])).toEqual([3, 1]);
    expect(moveOf(world([], { primary: { runes: [R('saturate', 4)] } }), 0).stacks).toBe(4);
  });

  it('a blow: its kind’s stacks and the bonus', () => {
    const w = blowWorld([light([R('saturate')])]);
    firstBlow(w);
    expect(w.monsters[0].status.stacks.fire).toBe(2);
    expect(blowNumbers(w.hero.stats, bal, w.hero.stats.weapon.blows[0]).stacks).toBe(2);
  });

  it('a shot blow: its shot brings the bonus', () => {
    const w = blowWorld([light([R('saturate')])], [dummy(13, 30)], {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    firstBlow(w);
    until(w, 'hit');
    expect(w.monsters[0].status.stacks.fire).toBe(2);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 3 failed and 23 passed (26): `expected [ 2, 1 ] to deeply equal [ 3, 1 ]` (the ability), `expected 1 to be 2` (the blow, and the shot).

- [ ] **Step 3: Add `stacksBonus`**

In `packages/engine/src/arpg/abilities/resolve.ts`:

Replace:

```ts
    stacks: bal.stacks.byWeight[wi],
```

with:

```ts
    stacks: bal.stacks.byWeight[wi] + knobs.stacksBonus,
```

Replace:

```ts
    stacks: bal.stacks.basicByKind[blow.kind],
```

with:

```ts
    stacks: bal.stacks.basicByKind[blow.kind] + blow.knobs.stacksBonus,
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
  const stacks = bal.stacks.basicByKind[kind];
```

with:

```ts
  const stacks = bal.stacks.basicByKind[kind] + k.stacksBonus;
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 26 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1492 tests pass and 14 are todo (1506) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/basic.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/arpg/basic.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): Saturate: stacksBonus on direct hits and blows" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: Multi-shot: the `extraShots` knob

Volley's darts and Barrage's impacts add `extraShots.count` to `ResolvedAbility.count`; every shot takes the cut, `extraShotPower(power, form)` (wave 0's one rule, which `runeText` reads too: in full, half on a Volley, none on a Barrage). A Bolt fires `1 + count` bolts in a fan at Volley's 0.22 rad steps, each hitting on its own; a Lance fires as many beams, which share one hit set (a foe is struck once a cast) and each chain and linger as one Lance does. A bow's or wand's blow fires `1 + count` shots in the same fan, each at the cut power; Twin Fang's extra shot stays one, without runes. With one shot, every path is today's.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/resolve.ts` (CRLF, never format)
- Modify: `packages/engine/src/arpg/abilities/forms.ts`
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Append at the end of the file:

```ts
describe('Multi-shot (the extraShots knob)', () => {
  const primary = (form: 'bolt' | 'volley' | 'lance', runes: RuneRef[] = []) =>
    moveOf(world([], { primary: { form, runes } }), 0);
  const barrage = (runes: RuneRef[] = []) =>
    moveOf(world([], { ultimate: { form: 'barrage', runes } }), 2);

  it('adds to Volley’s darts and Barrage’s impacts; the cut is full on a Bolt, half on Volley, none on Barrage', () => {
    expect(primary('volley', [R('multishot')]).count).toBe(primary('volley').count + 2);
    expect(primary('volley', [R('multishot')]).power / primary('volley').power).toBeCloseTo(0.8625);
    expect(barrage([R('multishot')]).count).toBe(barrage().count + 2);
    expect(barrage([R('multishot')]).power).toBeCloseTo(barrage().power);
    expect(primary('bolt', [R('multishot')]).count).toBe(primary('bolt').count);
    expect(primary('bolt', [R('multishot')]).power / primary('bolt').power).toBeCloseTo(0.725);
  });

  it('a Bolt fans its extra bolts; a Volley fires its extra darts', () => {
    const fired = (form: 'bolt' | 'volley') => {
      const w = world([dummy(13, 28)], { primary: { form, runes: [R('multishot')] } });
      press(w, 0);
      return w.projectiles.filter((p) => p.form === form);
    };
    const bolts = fired('bolt');
    expect(bolts).toHaveLength(3);
    const angles = bolts.map((p) => Math.atan2(p.vy, p.vx));
    expect(angles[1] - angles[0]).toBeCloseTo(0.22);
    expect(angles[2] - angles[1]).toBeCloseTo(0.22);
    expect(fired('volley')).toHaveLength(5);
  });

  it('a Lance fans its beams, which share one hit set and each linger where it hits', () => {
    const near = dummy(13, 34);
    const aside = dummy(13 + 5 * Math.sin(0.22), 36 - 5 * Math.cos(0.22));
    const cast = (runes: RuneRef[]) => {
      const w = world([near, aside], { primary: { form: 'lance', runes } });
      const events = press(w, 0);
      const hitsOn = (i: number) =>
        skillHits(events).filter((e) => e.id === w.monsters[i].id).length;
      return { w, events, near: hitsOn(0), aside: hitsOn(1) };
    };
    expect(cast([])).toMatchObject({ near: 1, aside: 0 });
    const fan = cast([R('multishot'), R('linger')]);
    expect(fan.events.filter((e) => e.kind === 'beam')).toHaveLength(3);
    expect(fan).toMatchObject({ near: 1, aside: 1 });
    expect(fan.w.zones.filter((z) => z.owner === 'hero' && z.ability)).toHaveLength(2);
  });

  it('a bow or wand blow fires a fan of shots, every one at the cut power', () => {
    const shots = (runes: RuneRef[]) => {
      const w = blowWorld([light(runes)], [dummy(13, 30)], {
        weapon: gear('fire', 'weapon', 'wand'),
      });
      firstBlow(w);
      return w.projectiles.filter((p) => p.owner === 'hero');
    };
    const plain = shots([]);
    const fan = shots([R('multishot')]);
    expect(plain).toHaveLength(1);
    expect(fan).toHaveLength(3);
    for (const p of fan) expect(p.damage / plain[0].damage).toBeCloseTo(0.725);
  });

  it("Twin Fang's extra shot stays one, without runes", () => {
    const w = blowWorld([light([R('multishot')])], [dummy(13, 30)], {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    w.hero.stats.legendaries.twin_fang = 50;
    firstBlow(w);
    const shots = w.projectiles.filter((p) => p.owner === 'hero');
    expect(shots).toHaveLength(4);
    expect(shots.filter((p) => !p.knobs)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 5 failed and 26 passed (31): `expected 3 to be 5` (Volley's count), `expected [ { owner: 'hero', …(21) } ] to have a length of 3 but got 1` (the Bolt's fan), `expected [ Array(1) ] to have a length of 3 but got 1` (the Lance's beams, the wand's shots) and `… to have a length of 4 but got 2` (Twin Fang).

- [ ] **Step 3: Count, cut and fans**

In `packages/engine/src/arpg/abilities/resolve.ts`:

Replace:

```ts
import { runeFits, runeKnobs } from '../../loot/runes.js';
```

with:

```ts
import { extraShotPower, runeFits, runeKnobs } from '../../loot/runes.js';
```

Replace:

```ts
  // Volley's darts by kind; a hold's stages count as medium, heavy and hold.
  const countKind = move.kind === 'hold' ? HOLD_STAGE_KINDS[stage] : move.kind;
```

with:

```ts
  // Volley's darts by kind; a hold's stages count as medium, heavy and hold.
  const countKind = move.kind === 'hold' ? HOLD_STAGE_KINDS[stage] : move.kind;
  // Multi-shot: Volley's darts and Barrage's impacts add its extra shots to the count, and every
  // shot takes the cut (`extraShotPower`: in full, half on a Volley, none on a Barrage); Bolt
  // and Lance fan theirs in `executeForm`.
  const shots = knobs.extraShots;
  const extra = shots && (move.form === 'volley' || move.form === 'barrage') ? shots.count : 0;
  const cut = shots ? extraShotPower(shots.power, move.form) : 1;
```

Replace:

```ts
    power: form.power * (1 + W.power * w) * payPower * knobs.power * attunePower,
```

with:

```ts
    power: form.power * (1 + W.power * w) * payPower * knobs.power * attunePower * cut,
```

Replace:

```ts
    count: form.countByKind?.[countKind] ?? form.count ?? 1,
```

with:

```ts
    count: (form.countByKind?.[countKind] ?? form.count ?? 1) + extra,
```

In `packages/engine/src/arpg/abilities/forms.ts`:

Replace the lines from `case 'bolt':` up to (not including) `case 'volley': {` with:

```ts
    case 'bolt': {
      h.facing = dir;
      // Multi-shot: 1 + its extra shots in a fan at Volley's spacing; each bolt hits on its own.
      const n = 1 + (ab.knobs.extraShots?.count ?? 0);
      for (let i = 0; i < n; i++) {
        const d = n > 1 ? rotate(dir, (i - (n - 1) / 2) * 0.22) : dir;
        spawnProjectile(ctx, {
          owner: 'hero',
          form: 'bolt',
          ability: ab,
          homingId: null,
          x: h.x + d.x * 0.6,
          y: h.y + d.y * 0.6,
          vx: d.x * ab.speed,
          vy: d.y * ab.speed,
          radius: 0.3 + 0.15 * size,
          damage: hit,
          element: ab.element,
          pierce: ab.knobs.pierce > 0,
          pierceLeft: ab.knobs.pierce,
          maxDist: ab.range,
          explodeRadius: ab.radius * size,
          applies: ab.knobs.applies,
          knockback: ab.knobs.knockback,
          heft,
        });
      }
      return done(h.x + dir.x * ab.range, h.y + dir.y * ab.range);
    }
```

Replace the lines from `case 'lance': {` up to (not including) `case 'burst': {` with:

```ts
    case 'lance': {
      h.facing = dir;
      const len = ab.range * size;
      const width = ab.radius;
      const opts = hitOpts(ab, { x: h.x, y: h.y }, false, true, heft);
      // Multi-shot: 1 + its extra beams in a fan at Volley's spacing. They share one hit set, so
      // a foe is struck once a cast; each beam that hits jumps from its farthest foe and leaves
      // its zone at its first, as one Lance does.
      const n = 1 + (ab.knobs.extraShots?.count ?? 0);
      const struck = new Set<number>();
      for (let i = 0; i < n; i++) {
        const d = n > 1 ? rotate(dir, (i - (n - 1) / 2) * 0.22) : dir;
        const ex = h.x + d.x * len;
        const ey = h.y + d.y * len;
        const hits = alive(ctx)
          .filter(
            (m) =>
              !struck.has(m.id) && distToSegment(m.x, m.y, h.x, h.y, ex, ey) <= width + m.radius,
          )
          .sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y));
        ctx.events.push({
          kind: 'beam',
          x: h.x,
          y: h.y,
          tx: ex,
          ty: ey,
          width,
          element: ab.element,
          infusion: ab.elements[1] ?? null,
        });
        for (const m of hits) {
          struck.add(m.id);
          hitMonster(ctx, m, hit, ab.element, opts);
        }
        if (hits.length > 0) {
          chainFrom(ctx, ab, hits[hits.length - 1], hit, struck);
          leaveZone(ctx, ab, hits[0].x, hits[0].y, Math.max(1.2, width * 2), hit);
        }
      }
      return done(h.x + dir.x * len, h.y + dir.y * len);
    }
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
    const weaponPierce = w.pierce ? Infinity : 0;
    for (let i = 0; i < (twin > 0 ? 2 : 1); i++) {
      const spread = i === 0 ? 0 : 0.12;
      const d = {
        x: dir.x * Math.cos(spread) - dir.y * Math.sin(spread),
        y: dir.x * Math.sin(spread) + dir.y * Math.cos(spread),
      };
      const pierceLeft = i === 0 ? weaponPierce + k.pierce : weaponPierce;
```

with:

```ts
    const weaponPierce = w.pierce ? Infinity : 0;
    // Multi-shot: 1 + its extra shots in a fan at Volley's spacing, each at the cut power. Twin
    // Fang's extra shot stays one, 0.12 off the blow's way, and carries no runes.
    const n = 1 + (k.extraShots?.count ?? 0);
    const shot = base * (k.extraShots?.power ?? 1);
    for (let i = 0; i < n + (twin > 0 ? 1 : 0); i++) {
      const main = i < n;
      const spread = main ? (i - (n - 1) / 2) * 0.22 : 0.12;
      const d = {
        x: dir.x * Math.cos(spread) - dir.y * Math.sin(spread),
        y: dir.x * Math.sin(spread) + dir.y * Math.cos(spread),
      };
      const pierceLeft = main ? weaponPierce + k.pierce : weaponPierce;
```

Replace:

```ts
        damage: i === 0 ? base : unit * twin,
        element,
        pierce: pierceLeft > 0,
        pierceLeft,
        maxDist: w.range + 1.5,
        explodeRadius: i === 0 ? (s.explode ?? 0) : 0,
        applies: i === 0 ? applies : [],
        knockback: 0,
        heft: s.heft,
        rattles,
        stacks: i === 0 ? stacks : 0,
        noReact: i === 1,
        ...(i === 0 ? { knobs: k } : {}),
```

with:

```ts
        damage: main ? shot : unit * twin,
        element,
        pierce: pierceLeft > 0,
        pierceLeft,
        maxDist: w.range + 1.5,
        explodeRadius: main ? (s.explode ?? 0) : 0,
        applies: main ? applies : [],
        knockback: 0,
        heft: s.heft,
        rattles,
        stacks: main ? stacks : 0,
        noReact: !main,
        ...(main ? { knobs: k } : {}),
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 31 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1497 tests pass and 14 are todo (1511) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/abilities/forms.ts src/arpg/basic.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/basic.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): Multi-shot: Volley and Barrage count, the cut by form, Bolt, Lance and shot fans" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: Split and Chain

### Task 7: Split: shards

An ability's impact that hits at least one foe (not a tick, not a shard) sheds `split.count` shards, evenly spaced round a circle starting along the hero → impact way (no RNG), each at `damage × split.power`, skipping the foes it hit (`spawnProjectile` takes optional `hitIds`), flying `shardSpeed` for `shardRange`. A shard carries the move with `split`, `extraShots`, `echo`, `zone`, `chain` and `guardOnLand` cleared; its impact (`ImpactOpts.shard`) is direct (it can crit and applies the move's stacks) but doesn't scatter, shows no explosion, leaves no zone, makes no embers and sheds nothing; at the end of its flight it just ends. A basic shot's first hit (`shotLands`) sheds basic shards (no ability, no knobs: the shot's element, `applies` and a tick's stacks) skipping that foe; a bursting shot sheds them after its burst, skipping every foe it hit. A `runeFx` (`'split'`) marks each.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/targeting.ts` (CRLF, never format)
- Modify: `packages/engine/src/arpg/abilities/impact.ts`
- Modify: `packages/engine/src/arpg/step.ts`
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Replace the lines from `import { describe, it, expect } from 'vitest';` up to (not including) `// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  NEUTRAL,
  blowNumbers,
  defaultBasic,
  followBasic,
  mergeKnobs,
} from '../src/arpg/abilities/resolve.js';
import { landBlow } from '../src/arpg/basic.js';
import { makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import {
  STEP,
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  type ArenaOpts,
} from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('Split (the split knob)', () => {
  it("an ability: an impact that hits sheds shards from the hero's way round it, skipping the foes it hit", () => {
    const w = world([dummy(13, 30), dummy(13, 27.5)], { primary: { runes: [R('split')] } });
    press(w, 0);
    const bolt = w.projectiles.find((p) => p.form === 'bolt')!;
    expect(until(w, 'runeFx').find((e) => e.kind === 'runeFx')).toMatchObject({
      effect: 'split',
      element: 'fire',
    });
    const shards = w.projectiles.filter((p) => p.form === 'shard');
    expect(shards).toHaveLength(3);
    const angles = shards.map((p) => Math.atan2(p.vy, p.vx));
    expect(angles[0]).toBeCloseTo(-Math.PI / 2);
    expect(angles[1] - angles[0]).toBeCloseTo((2 * Math.PI) / 3);
    for (const p of shards) {
      expect(p.damage).toBeCloseTo(bolt.damage * 0.4);
      expect(p.hitIds).toEqual([w.monsters[0].id]);
      expect(p.ability?.knobs.split).toBeNull();
    }
    run(w, 1);
    expect(w.monsters[1].hp).toBeLessThan(w.monsters[1].maxHp);
  });

  it("shards don't split, scatter, show an explosion, leave a zone or burst at the end of their flight", () => {
    // A Wildfire Bolt scatters and leaves a zone where it lands; its shards do neither.
    const w = world([dummy(13, 30), dummy(13, 27.5)], {
      primary: { elements: ['fire', 'nature'], runes: [R('split')] },
    });
    const events = [...press(w, 0), ...until(w, 'runeFx')];
    // The Bolt's own ground; then its shards fly out and end.
    expect(w.zones.filter((z) => z.owner === 'hero' && z.ability)).toHaveLength(1);
    const shards = new Set<number>();
    for (let i = 0; i < 15; i++) {
      for (const p of w.projectiles) if (p.form === 'shard') shards.add(p.id);
      events.push(...run(w, STEP));
    }
    expect(shards.size).toBe(3);
    expect(w.projectiles).toHaveLength(0);
    expect(events.filter((e) => e.kind === 'runeFx')).toHaveLength(1);
    // The Bolt's own burst only (Wildfire's Combusts show as Nature).
    expect(events.filter((e) => e.kind === 'explode' && e.element === 'fire')).toHaveLength(1);
    expect(w.zones.filter((z) => z.owner === 'hero' && z.ability)).toHaveLength(1);
  });

  it('a shot blow: its first hit sheds shards (basic shots) that skip the foe it hit', () => {
    const w = blowWorld([light([R('split')])], [dummy(13, 30), dummy(13, 27.5)], {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    firstBlow(w);
    w.hero.nextAttackAt = 1e9;
    const shot = w.projectiles.find((p) => p.owner === 'hero')!;
    until(w, 'runeFx');
    const shards = w.projectiles.filter((p) => p.form === 'shard');
    expect(shards).toHaveLength(3);
    for (const p of shards) {
      expect(p.ability).toBeNull();
      expect(p.knobs).toBeUndefined();
      expect(p.damage).toBeCloseTo(shot.damage * 0.4);
      expect(p.hitIds).toEqual([w.monsters[0].id]);
    }
    run(w, 1);
    expect(w.monsters[1].hp).toBeLessThan(w.monsters[1].maxHp);
  });

  it('a shot that bursts sheds them after its burst, skipping every foe the burst hit', () => {
    // A staff's heavy shot bursts over both foes.
    const w = blowWorld([{ kind: 'heavy', element: 'fire' }], [dummy(13, 30), dummy(13.8, 30)], {
      weapon: gear('fire', 'weapon', 'staff'),
    });
    const blow = w.hero.stats.weapon.blows[0];
    w.hero.stats.weapon.blows[0] = {
      ...blow,
      knobs: mergeKnobs({ split: { count: 2, power: 0.5 } }),
    };
    firstBlow(w);
    until(w, 'runeFx');
    const shards = w.projectiles.filter((p) => p.form === 'shard');
    expect(shards).toHaveLength(2);
    for (const p of shards) expect(p.hitIds).toEqual(w.monsters.map((m) => m.id));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 4 failed and 31 passed (35): `expected undefined to match object { effect: 'split', element: 'fire' }`, `expected [] to have a length of 1 but got +0`, `expected [] to have a length of 3 but got +0` and `expected [] to have a length of 2 but got +0`: no shards.

- [ ] **Step 3: Shards**

In `packages/engine/src/arpg/abilities/targeting.ts`:

Replace the lines from `export function spawnProjectile(` up to (not including) `/** Forms fired along a way from the hero (the rest are placed, self-centred or Blink). */` with:

```ts
export function spawnProjectile(
  ctx: SimCtx,
  p: Omit<Projectile, 'id' | 'hitIds' | 'traveled' | 'dead' | 'pierceLeft'> & {
    /** Foes it may pass (default: all when `pierce`, else none). */
    pierceLeft?: number;
    /** Foes it never hits (a Split shard skips those its impact hit). */
    hitIds?: number[];
  },
): Projectile {
  const proj: Projectile = {
    ...p,
    pierceLeft: p.pierceLeft ?? (p.pierce ? Infinity : 0),
    id: ctx.world.nextId++,
    hitIds: p.hitIds ? [...p.hitIds] : [],
    traveled: 0,
    dead: false,
  };
  ctx.world.projectiles.push(proj);
  return proj;
}
```

In `packages/engine/src/arpg/abilities/impact.ts`:

Replace:

```ts
import { ABILITY_SLOTS, type Knobs, type ResolvedAbility } from '../../types/ability.js';
import type { MonsterEntity, Vec } from '../../types/arpg.js';
```

with:

```ts
import {
  ABILITY_SLOTS,
  type Knobs,
  type ResolvedAbility,
  type SplitKnob,
} from '../../types/ability.js';
import type { MonsterEntity, StatusId, Vec } from '../../types/arpg.js';
import type { ManaType } from '../../types/mana.js';
```

Replace:

```ts
import { dist } from '../geometry.js';
```

with:

```ts
import { dirTo, dist } from '../geometry.js';
```

Replace:

```ts
const EMBER_FORMS = new Set(['bolt', 'burst', 'barrage']);
```

with:

```ts
const EMBER_FORMS = new Set(['bolt', 'burst', 'barrage']);

/** A Split shard's size: it hits what it touches. */
const SHARD_RADIUS = 0.2;
```

Replace:

```ts
  if (k.scatter > 0 && !o.tick && !o.noScatter) {
```

with:

```ts
  // A Split shard's impact doesn't scatter, nor show an explosion (its flight is its look).
  if (k.scatter > 0 && !o.tick && !o.noScatter && !o.shard) {
```

Replace:

```ts
  if (!o.silent)
```

with:

```ts
  if (!o.silent && !o.shard)
```

Replace:

```ts
  if (!o.tick) {
    leaveZone(ctx, ab, x, y, radius, damage);
    embers(ctx, ab, x, y, damage);
  }
  return hits;
}
```

with:

```ts
  // A shard leaves no zone, makes no embers and sheds no shards.
  if (!o.tick && !o.shard) {
    leaveZone(ctx, ab, x, y, radius, damage);
    embers(ctx, ab, x, y, damage);
    // Split: an impact that hit sheds shards, each carrying the move without the knobs that
    // would multiply them (shards of shards, a zone or an echo per shard).
    if (k.split && hits.length > 0) {
      const ability: ResolvedAbility = {
        ...ab,
        knobs: {
          ...k,
          split: null,
          extraShots: null,
          echo: 0,
          zone: null,
          chain: 0,
          guardOnLand: 0,
        },
      };
      shedShards(ctx, x, y, k.split, damage, hits, {
        ability,
        element: ab.element,
        applies: k.applies,
      });
    }
  }
  return hits;
}

/**
 * Split: `split.count` shards from (x, y), evenly spaced round a circle that
 * starts along the way from the hero to (x, y) (no RNG), each at `damage` ×
 * `split.power`, skipping the foes in `hit`, flying `shardSpeed` for
 * `shardRange` and ending there. An ability's shard (`carry.ability`) lands as
 * one impact the shard's size; a basic shot's hits as a basic shot (a tick's
 * stacks). A `runeFx` marks it.
 */
export function shedShards(
  ctx: SimCtx,
  x: number,
  y: number,
  split: SplitKnob,
  damage: number,
  hit: readonly MonsterEntity[],
  carry: { ability: ResolvedAbility | null; element: ManaType | null; applies: StatusId[] },
): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const way = dirTo(h.x, h.y, x, y);
  const from = way.x === 0 && way.y === 0 ? h.facing : way;
  const start = Math.atan2(from.y, from.x);
  for (let i = 0; i < split.count; i++) {
    const a = start + (Math.PI * 2 * i) / split.count;
    spawnProjectile(ctx, {
      owner: 'hero',
      form: 'shard',
      ability: carry.ability,
      homingId: null,
      x,
      y,
      vx: Math.cos(a) * bal.runes.shardSpeed,
      vy: Math.sin(a) * bal.runes.shardSpeed,
      radius: SHARD_RADIUS,
      damage: damage * split.power,
      element: carry.element,
      pierce: false,
      pierceLeft: 0,
      maxDist: bal.runes.shardRange,
      explodeRadius: carry.ability ? SHARD_RADIUS : 0,
      applies: carry.applies,
      knockback: 0,
      heft: 0,
      hitIds: hit.map((m) => m.id),
    });
  }
  ctx.events.push({ kind: 'runeFx', effect: 'split', x, y, element: carry.element });
}
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
        impact(ctx, p.ability, p.x, p.y, p.explodeRadius, p.damage, {
          from,
          tick: p.form === 'ember',
          heft: p.heft,
        });
      else if (p.explodeRadius > 0) {
        burstShot(ctx, p, m);
        break;
      } else
        hitMonster(ctx, m, p.damage, p.element, {
          source: 'basic',
          canCrit: true,
          applies: p.applies,
          heft: p.heft ?? 0,
          rattles: p.rattles,
          stacks: p.stacks,
          noReact: p.noReact,
          ...(p.knobs ? knobHitOpts(p.knobs) : {}),
        });
```

with:

```ts
        impact(ctx, p.ability, p.x, p.y, p.explodeRadius, p.damage, {
          from,
          tick: p.form === 'ember',
          heft: p.heft,
          shard: p.form === 'shard',
        });
      else if (p.explodeRadius > 0) {
        burstShot(ctx, p, m);
        break;
      } else {
        hitMonster(ctx, m, p.damage, p.element, {
          source: 'basic',
          canCrit: true,
          applies: p.applies,
          heft: p.heft ?? 0,
          rattles: p.rattles,
          stacks: p.stacks,
          noReact: p.noReact,
          ...(p.knobs ? knobHitOpts(p.knobs) : {}),
        });
        // A basic shot's knobs act where it first hits.
        if (p.knobs && p.hitIds.length === 1) shotLands(ctx, p, [m]);
      }
```

Replace:

```ts
      // A bolt that reaches the end of its flight bursts on the ground.
      if (p.ability && !p.pierce && p.form !== 'volley') {
```

with:

```ts
      // A bolt that reaches the end of its flight bursts on the ground (a Split shard just ends).
      if (p.ability && !p.pierce && p.form !== 'volley' && p.form !== 'shard') {
```

Replace:

```ts
import { basicHoldTick, burstShot, startSwing, strike } from './basic.js';
```

with:

```ts
import { basicHoldTick, burstShot, shotLands, startSwing, strike } from './basic.js';
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
/** A basic shot with an explosion bursts over the foe it struck and every foe around it (each once). */
export function burstShot(ctx: SimCtx, p: Projectile, struck: MonsterEntity | null = null): void {
```

with:

```ts
/**
 * A basic shot's knobs where it lands (see `burstShot` and the projectile tick):
 * `hit` are the foes it hit there, the one it struck first. Split's shards
 * skip them all.
 */
export function shotLands(ctx: SimCtx, p: Projectile, hit: readonly MonsterEntity[]): void {
  const k = p.knobs!;
  if (k.split)
    shedShards(ctx, p.x, p.y, k.split, p.damage, hit, {
      ability: null,
      element: p.element,
      applies: p.applies,
    });
}

/**
 * A basic shot with an explosion bursts over the foe it struck and every foe
 * around it (each once); with knobs, they act after the burst (`shotLands`).
 */
export function burstShot(ctx: SimCtx, p: Projectile, struck: MonsterEntity | null = null): void {
```

Replace:

```ts
  for (const m of alive(ctx)) {
    if (m !== struck && dist(p.x, p.y, m.x, m.y) > p.explodeRadius + m.radius) continue;
    hitMonster(ctx, m, p.damage, p.element, {
```

with:

```ts
  const hit: MonsterEntity[] = struck ? [struck] : [];
  for (const m of alive(ctx)) {
    if (m !== struck && dist(p.x, p.y, m.x, m.y) > p.explodeRadius + m.radius) continue;
    if (m !== struck) hit.push(m);
    hitMonster(ctx, m, p.damage, p.element, {
```

Replace:

```ts
      ...(p.knobs ? knobHitOpts(p.knobs) : {}),
    });
  }
}
```

with:

```ts
      ...(p.knobs ? knobHitOpts(p.knobs) : {}),
    });
  }
  if (p.knobs && hit.length > 0) shotLands(ctx, p, hit);
}
```

Replace:

```ts
import { knobHitOpts } from './abilities/impact.js';
```

with:

```ts
import { knobHitOpts, shedShards } from './abilities/impact.js';
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 35 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1501 tests pass and 14 are todo (1515) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/abilities/impact.ts src/arpg/step.ts src/arpg/basic.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/abilities/targeting.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/basic.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): Split: shards from an ability's impact and a basic shot's hit, that never multiply" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: Chain on blows: `chainJumps`

`chainFrom`'s body becomes `chainJumps(ctx, first, damage, element, jumps, opts, hit)`, with the Storm mastery's +2 (when there are jumps) and the per-jump knockback origin; `chainFrom` calls it with the ability's hit options, so abilities chain exactly as before. A melee blow jumps from the first foe it struck, a shot from the foe it hit (`shotLands`), each with its blow's `chain`.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/impact.ts`
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Append at the end of the file:

```ts
describe('Chain on blows (chainJumps)', () => {
  /** The `chain` events' points, and which foes took a basic hit. */
  const chained = (w: ArpgWorld, events: ArpgEvent[]) => ({
    points: events.flatMap((e) => (e.kind === 'chain' ? [e.points.length] : [])),
    hit: w.monsters.map((m) => m.hp < m.maxHp),
  });
  const line = [dummy(13, 34.5), dummy(13, 31.5), dummy(13, 28.5), dummy(13, 25.5)];

  it('a melee blow jumps from the first foe it strikes', () => {
    const w = blowWorld([light([R('chain')])], line);
    expect(chained(w, firstBlow(w))).toEqual({ points: [3], hit: [true, true, true, false] });
    const plain = blowWorld([light()], line);
    expect(chained(plain, firstBlow(plain))).toEqual({
      points: [],
      hit: [true, false, false, false],
    });
  });

  it('with the Storm mastery, 2 jumps more, as an ability’s', () => {
    const w = arena(line, { equipped: SWORD });
    w.hero.stats = computeHeroStats(SWORD, registry, {
      basic: [light([R('chain', 1)])],
      attunement: { storm: bal.mana.masteryThreshold },
    });
    expect(chained(w, firstBlow(w)).points).toEqual([4]);
  });

  it('a shot blow jumps from the foe it hits', () => {
    const w = blowWorld([light([R('chain')])], line.slice(1), {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    const events = [...firstBlow(w), ...until(w, 'chain')];
    expect(chained(w, events)).toEqual({ points: [3], hit: [true, true, true] });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 3 failed and 35 passed (38): `expected { points: [], …(1) } to deeply equal { points: [ 3 ], …(1) }` (melee and shot) and `expected [] to deeply equal [ 4 ]` (the Storm mastery).

- [ ] **Step 3: `chainJumps`, and a blow's jumps**

In `packages/engine/src/arpg/abilities/impact.ts`:

Replace the lines from `` /** Lightning-style jumps from `first` to foes not yet hit, each weaker than the last. */ `` up to (not including) `/** Lingering ground (Magma, Rimebloom, Wildfire…) where an ability lands. */` with:

```ts
/**
 * Lightning-style jumps from `first` to foes not yet hit (`hit`, which they
 * join), each `chainPower` weaker than the last: `jumps` of them, 2 more with
 * the Storm mastery when there are any. Each hits with `opts`, knocked back
 * from the foe it jumps from. Abilities (`chainFrom`) and basic blows share it.
 */
export function chainJumps(
  ctx: SimCtx,
  first: MonsterEntity,
  damage: number,
  element: ManaType,
  jumps: number,
  opts: HitOpts,
  hit: Set<number>,
): void {
  const storm = hasMastery(ctx.registry, ctx.world.hero.stats.attunement, 'storm');
  const total = jumps + (jumps > 0 && storm ? 2 : 0);
  if (total <= 0) return;
  const { chainRange, chainPower } = ctx.bal.abilities;
  const points: Vec[] = [{ x: first.x, y: first.y }];
  let current = first;
  let amount = damage;
  for (let i = 0; i < total; i++) {
    const next = nearestMonster(ctx, current.x, current.y, chainRange, hit);
    if (!next) break;
    hit.add(next.id);
    amount *= chainPower;
    points.push({ x: next.x, y: next.y });
    hitMonster(ctx, next, amount, element, { ...opts, kbFrom: current });
    current = next;
  }
  if (points.length > 1) ctx.events.push({ kind: 'chain', points, element });
}

/** An ability's jumps (its `chain` knob) from `first`: hits that aren't direct. */
export function chainFrom(
  ctx: SimCtx,
  ab: ResolvedAbility,
  first: MonsterEntity,
  damage: number,
  hit: Set<number>,
  tick = false,
): void {
  const opts = hitOpts(ab, first, tick, false);
  chainJumps(ctx, first, damage, ab.element, ab.knobs.chain, opts, hit);
}
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
    const kb = s.knockback ? { knockback: s.knockback, kbFrom: { x: h.x, y: h.y } } : {};
    for (const m of alive(ctx)) {
```

with:

```ts
    const kb = s.knockback ? { knockback: s.knockback, kbFrom: { x: h.x, y: h.y } } : {};
    const struck = new Set<number>();
    let first: MonsterEntity | null = null;
    for (const m of alive(ctx)) {
```

Replace:

```ts
      landed = true;
      hitMonster(ctx, m, base, element, {
```

with:

```ts
      landed = true;
      first ??= m;
      struck.add(m.id);
      hitMonster(ctx, m, base, element, {
```

Replace:

```ts
          stacks: 0,
          noReact: true,
        });
    }
  } else {
```

with:

```ts
          stacks: 0,
          noReact: true,
        });
    }
    // Chain: jumps from the first foe struck.
    if (first) {
      const jump = { source: 'basic' as const, canCrit: true, applies, rattles, ...knobbed };
      chainJumps(ctx, first, base, element, k.chain, jump, struck);
    }
  } else {
```

Replace:

```ts
 * `hit` are the foes it hit there, the one it struck first. Split's shards
 * skip them all.
 */
export function shotLands(ctx: SimCtx, p: Projectile, hit: readonly MonsterEntity[]): void {
  const k = p.knobs!;
```

with:

```ts
 * `hit` are the foes it hit there, the one it struck first. Chain jumps from
 * that one; Split's shards skip them all.
 */
export function shotLands(ctx: SimCtx, p: Projectile, hit: readonly MonsterEntity[]): void {
  const k = p.knobs!;
  // Chain: jumps from the foe it struck.
  const jump = {
    source: 'basic' as const,
    canCrit: true,
    applies: p.applies,
    rattles: p.rattles,
    ...knobHitOpts(k),
  };
  chainJumps(ctx, hit[0], p.damage, p.element!, k.chain, jump, new Set(hit.map((m) => m.id)));
```

Replace:

```ts
import { knobHitOpts, shedShards } from './abilities/impact.js';
```

with:

```ts
import { chainJumps, knobHitOpts, shedShards } from './abilities/impact.js';
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 38 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1504 tests pass and 14 are todo (1518) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/abilities/impact.ts src/arpg/basic.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/basic.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): Chain on blows: chainJumps shared with abilities, the Storm mastery's +2 included" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: Linger on blows, and Echo

### Task 9: Linger on blows: a hero zone with no ability

A heavy or hold blow with a `zone` (Linger acts on no other kind: `runeKnobs` leaves it out) leaves a hero zone with `ability: null`: a melee blow that connects, ahead at half its reach; a shot, where it first hits. Radius 1.2, a tick every 0.5 s for `hit × tickPower`, for `zone.seconds`. `zonesTick` hits each foe inside such a zone as a basic hit of its element, without a crit.

**Files:**
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/src/arpg/step.ts`
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Append at the end of the file:

```ts
describe('Linger on blows (a hero zone with no ability)', () => {
  const heavy = (runes: RuneRef[]): Blow => ({ kind: 'heavy', element: 'fire', runes });
  const lingering = (w: ArpgWorld) => w.zones.filter((z) => z.owner === 'hero' && !z.ability);

  it('a heavy melee blow that connects leaves a zone ahead, at half its reach, ticking as a basic hit', () => {
    const w = blowWorld([heavy([R('linger')])]);
    const hit = basicHits(firstBlow(w))[0];
    w.hero.nextAttackAt = 1e9;
    const [zone] = lingering(w);
    const reach = w.hero.stats.weapon.range + (w.hero.stats.weapon.feel.heavy.reach ?? 0);
    expect(zone).toMatchObject({ x: 13, radius: 1.2, element: 'fire', tick: 0.5 });
    expect(zone.y).toBeCloseTo(w.hero.y - reach / 2);
    expect(zone.until - zone.born).toBeCloseTo(2.5);
    expect(zone.damage).toBeCloseTo(
      w.hero.stats.weaponDamage *
        w.hero.stats.damageMult *
        w.hero.stats.weapon.feel.heavy.power *
        0.2,
    );
    const ticks = basicHits(run(w, 1.05)).filter((e) => !e.crit && e.heft === 0);
    expect(ticks).toHaveLength(2);
    expect(ticks[0].amount).toBeLessThan(hit.amount);
  });

  it('a light blow leaves none: Linger acts on heavy and hold blows only', () => {
    const w = blowWorld([light([R('linger')])]);
    firstBlow(w);
    expect(lingering(w)).toHaveLength(0);
  });

  it('a heavy shot leaves its zone where it hits', () => {
    const w = blowWorld([heavy([R('linger')])], [dummy(13, 30)], {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    firstBlow(w);
    w.hero.nextAttackAt = 1e9;
    until(w, 'hit');
    const [zone] = lingering(w);
    expect(zone.x).toBeCloseTo(13);
    expect(Math.abs(zone.y - 30)).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 2 failed and 39 passed (41): `expected undefined to match object { x: 13, radius: 1.2, …(2) }` and `TypeError: Cannot read properties of undefined (reading 'x')`. The light blow's test passes already.

- [ ] **Step 3: Blow zones**

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
    // Chain: jumps from the first foe struck.
    if (first) {
      const jump = { source: 'basic' as const, canCrit: true, applies, rattles, ...knobbed };
      chainJumps(ctx, first, base, element, k.chain, jump, struck);
    }
```

with:

```ts
    // Chain: jumps from the first foe struck. Linger: a zone ahead, at half the reach.
    if (first) {
      const jump = { source: 'basic' as const, canCrit: true, applies, rattles, ...knobbed };
      chainJumps(ctx, first, base, element, k.chain, jump, struck);
      if (k.zone)
        blowZone(ctx, h.x + dir.x * reach * 0.5, h.y + dir.y * reach * 0.5, base, element, k.zone);
    }
```

Replace:

```ts
  chainJumps(ctx, hit[0], p.damage, p.element!, k.chain, jump, new Set(hit.map((m) => m.id)));
```

with:

```ts
  chainJumps(ctx, hit[0], p.damage, p.element!, k.chain, jump, new Set(hit.map((m) => m.id)));
  // Linger: a zone where it hit.
  if (k.zone) blowZone(ctx, p.x, p.y, p.damage, p.element!, k.zone);
```

Replace:

```ts
/**
 * A basic shot's knobs where it lands (see `burstShot` and the projectile tick):
 * `hit` are the foes it hit there, the one it struck first. Chain jumps from
 * that one; Split's shards skip them all.
 */
```

with:

```ts
/** A blow's Linger zone's radius. */
const BLOW_ZONE_RADIUS = 1.2;

/**
 * Linger on a heavy or hold blow: a hero zone with no ability at (x, y), for
 * `zone.seconds`, whose ticks (every 0.5 s, `zonesTick`) hit each foe inside as
 * a basic hit for `hit × zone.tickPower`.
 */
function blowZone(
  ctx: SimCtx,
  x: number,
  y: number,
  hit: number,
  element: ManaType,
  zone: ZoneKnob,
): void {
  const { world } = ctx;
  world.zones.push({
    id: world.nextId++,
    owner: 'hero',
    source: 'linger',
    ability: null,
    x,
    y,
    radius: BLOW_ZONE_RADIUS,
    born: world.t,
    until: world.t + zone.seconds,
    tick: 0.5,
    nextTick: world.t + 0.5,
    damage: hit * zone.tickPower,
    element,
    detonateAt: 0,
    dead: false,
  });
}

/**
 * A basic shot's knobs where it lands (see `burstShot` and the projectile tick):
 * `hit` are the foes it hit there, the one it struck first. Chain jumps from
 * that one, Linger leaves its zone there, and Split's shards skip them all.
 */
```

Replace:

```ts
import { HOLD_STAGE_KINDS, type MoveKind } from '../types/ability.js';
import type { ComboStepDef, DelveBalance, HeroBlow, HeroWeapon } from '../types/delve.js';
```

with:

```ts
import { HOLD_STAGE_KINDS, type MoveKind, type ZoneKnob } from '../types/ability.js';
import type { ComboStepDef, DelveBalance, HeroBlow, HeroWeapon } from '../types/delve.js';
import type { ManaType } from '../types/mana.js';
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
    if (z.ability)
      impact(ctx, z.ability, z.x, z.y, z.radius, z.damage, { tick: true, silent: true });
```

with:

```ts
    if (z.ability)
      impact(ctx, z.ability, z.x, z.y, z.radius, z.damage, { tick: true, silent: true });
    else {
      // A blow's Linger: each foe inside takes a basic hit (no crit) of its element.
      const applies = z.element ? [BASIC_STATUS[z.element]] : [];
      for (const m of world.monsters)
        if (!m.dead && dist(z.x, z.y, m.x, m.y) <= z.radius + m.radius)
          hitMonster(ctx, m, z.damage, z.element, { source: 'basic', canCrit: false, applies });
    }
```

Replace:

```ts
import {
  healHero,
  hitMonster,
```

with:

```ts
import {
  BASIC_STATUS,
  healHero,
  hitMonster,
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 41 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1507 tests pass and 14 are todo (1521) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/basic.ts src/arpg/step.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): Linger on heavy and hold blows: a hero zone ticking as a basic hit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 10: Echo: the move or the blow again

`fire` queues an echo when it lands a move with `echo > 0`: `{ at: t + echoDelay, slot, ability: the move as it landed, aim: where it landed }`; `strike` queues a blow's: `{ blow: its step, stage: the held blow's stage (null otherwise), dir }`. `echoTick` runs right after `castTick`: an ability's echo goes through `executeForm` as a copy at `power × echo` with no `echo` or `guardOnLand` (so it never echoes and never guards), keeping its stage, step bonus, `last`, extra shots and split; it costs nothing, starts no beat, cooldown or recoil, makes no `cast` event and leaves the hero's facing as it was. A blow's echo is `landBlow` at `echo` × its power from where the hero stands, along its way: no step, mana, chain step or Twin Fang. A `runeFx` (`'echo'`) marks each. This replaces wave 0's stub file.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/echo.ts` (wave 0's stubs replaced)
- Modify: `packages/engine/src/arpg/abilities/cast.ts`
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/src/arpg/step.ts`
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Replace the lines from `import { describe, it, expect } from 'vitest';` up to (not including) `// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  NEUTRAL,
  blowNumbers,
  defaultBasic,
  followBasic,
  mergeKnobs,
} from '../src/arpg/abilities/resolve.js';
import { landBlow } from '../src/arpg/basic.js';
import { makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import {
  STEP,
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  holdFor,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  type ArenaOpts,
} from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('Echo (the echo knob)', () => {
  it('an ability: the move again after echoDelay at its fraction, free, with no beat, cast or echo of its own', () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('echo')] } });
    const cast = press(w, 0);
    const first = w.projectiles.find((p) => p.form === 'bolt')!;
    const at = w.t;
    const { mana, beatUntil, cooldowns } = w.hero;
    const [beat, cooldown] = [beatUntil[0], cooldowns[0][0]];
    w.hero.facing = { x: 1, y: 0 };
    const events = until(w, 'runeFx');
    expect(w.t - at).toBeCloseTo(bal.runes.echoDelay, 1);
    const echo = w.projectiles.find((p) => p.form === 'bolt' && p.id !== first.id)!;
    expect(echo.damage).toBeCloseTo(first.damage * 0.45);
    expect(echo.ability?.knobs.echo).toBe(0);
    expect(events.find((e) => e.kind === 'runeFx')).toMatchObject({
      effect: 'echo',
      element: 'fire',
    });
    expect([...cast, ...events].filter((e) => e.kind === 'cast')).toHaveLength(1);
    expect(w.hero.mana).toBeGreaterThanOrEqual(mana);
    expect([w.hero.beatUntil[0], w.hero.cooldowns[0][0]]).toEqual([beat, cooldown]);
    expect(w.hero.facing).toEqual({ x: 1, y: 0 });
    expect(w.echoes).toHaveLength(0);
    run(w, 1);
    expect(w.echoes).toHaveLength(0);
  });

  it("a hold's echo repeats the stage that fired", () => {
    const w = world([dummy(13, 30)], { primary: { kind: 'hold', runes: [R('echo')] } });
    holdFor(w, 0, 1.2);
    run(w, 0.3);
    const [first] = w.projectiles.filter((p) => p.form === 'bolt');
    until(w, 'runeFx');
    const echo = w.projectiles.find((p) => p.form === 'bolt' && p.id !== first.id)!;
    expect(first.ability?.stage).toBe(2);
    expect(echo.ability?.stage).toBe(2);
    expect(echo.damage).toBeCloseTo(first.damage * 0.45);
  });

  it('a blow: the blow again where the hero stands, no swing, step, mana or chain step', () => {
    const w = blowWorld([light([R('echo')])]);
    w.hero.stats.critChance = 0;
    const [hit] = basicHits(firstBlow(w));
    w.hero.nextAttackAt = 1e9;
    const { attackCount, mana } = w.hero;
    const events = until(w, 'runeFx');
    expect(basicHits(events)).toHaveLength(1);
    expect(basicHits(events)[0].amount).toBeCloseTo(hit.amount * 0.45);
    expect(events.filter((e) => e.kind === 'basic')).toHaveLength(0);
    expect([w.hero.attackCount, w.hero.mana]).toEqual([attackCount, mana]);
  });

  it("a hold blow's echo replays the stage it struck at", () => {
    const w = blowWorld([{ kind: 'hold', element: 'fire', runes: [R('echo')] }]);
    w.hero.stats.critChance = 0;
    const events: ArpgEvent[] = [];
    for (let i = 0; i < 300 && !events.some((e) => e.kind === 'basic'); i++)
      events.push(...stepWorld(registry, w, { move: { x: 0, y: 0 }, attack: w.t < 1 }, STEP));
    // Let go at stage 1: it struck as a heavy blow.
    expect(events.find((e) => e.kind === 'basic')).toMatchObject({ moveKind: 'heavy' });
    const [hit] = basicHits(events);
    w.hero.nextAttackAt = 1e9;
    const echo = basicHits(until(w, 'runeFx'));
    expect(echo).toHaveLength(1);
    expect(echo[0].amount).toBeCloseTo(hit.amount * 0.45);
  });

  it('a shot blow: the shot again', () => {
    const w = blowWorld([light([R('echo')])], [dummy(13, 30)], {
      weapon: gear('fire', 'weapon', 'wand'),
    });
    firstBlow(w);
    w.hero.nextAttackAt = 1e9;
    const [shot] = w.projectiles.filter((p) => p.owner === 'hero');
    until(w, 'runeFx');
    const echo = w.projectiles.filter((p) => p.owner === 'hero' && p.id !== shot.id);
    expect(echo).toHaveLength(1);
    expect(echo[0].damage).toBeCloseTo(shot.damage * 0.45);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 5 failed and 41 passed (46): `expected 2.9999999999999982 to be close to 0.4` (no echo in 3 s), `TypeError: Cannot read properties of undefined (reading 'ability')` (the hold's), and `expected [] to have a length of 1 but got +0` (the blow's, the hold blow's and the shot's).

- [ ] **Step 3: Queue and run echoes**

In `packages/engine/src/arpg/abilities/echo.ts`:

Replace the lines from `import type { Echo } from '../../types/arpg.js';` up to the end of the file with:

```ts
import { HOLD_STAGE_KINDS, type ResolvedAbility } from '../../types/ability.js';
import type { Echo } from '../../types/arpg.js';
import { landBlow } from '../basic.js';
import type { SimCtx } from '../combat.js';
import { executeForm } from './forms.js';

/** Queue a move's or a blow's echo on `ArpgWorld.echoes` (see `echoTick`). */
export function queueEcho(ctx: SimCtx, echo: Echo): void {
  ctx.world.echoes.push(echo);
}

/**
 * Run the echoes that are due, in the order they were queued (called right
 * after `castTick`; see the runes spec's Echo). An ability's runs its move as it
 * landed (its stage, its step bonus, its extra shots and split) through
 * `executeForm` at `power × echo`, with no echo or Guard of its own, from where
 * the hero stands toward where the move landed (a Nova goes off round the hero).
 * It costs nothing, starts no beat, cooldown or recoil, makes no `cast` event,
 * and leaves the hero's facing as it was. A blow's strikes again (a held blow at
 * its stage) from where the hero stands, along its way, at `echo` × its power:
 * no step, mana, chain step or Twin Fang. A `runeFx` marks each that goes off.
 */
export function echoTick(ctx: SimCtx): void {
  const { world } = ctx;
  const due = world.echoes.filter((e) => world.t >= e.at - 1e-9);
  if (due.length === 0) return;
  world.echoes = world.echoes.filter((e) => !due.includes(e));
  const h = world.hero;
  for (const e of due) {
    if (e.ability) {
      const ab = e.ability;
      const knobs = { ...ab.knobs, echo: 0, guardOnLand: 0 };
      const copy: ResolvedAbility = { ...ab, power: ab.power * ab.knobs.echo, knobs };
      const facing = h.facing;
      const res = executeForm(ctx, copy, e.aim);
      h.facing = facing;
      if (res.ok)
        ctx.events.push({
          kind: 'runeFx',
          effect: 'echo',
          x: res.tx,
          y: res.ty,
          element: ab.element,
        });
    } else if (e.blow !== null && e.dir) {
      const blow = h.stats.weapon.blows[e.blow];
      if (!blow) continue;
      const kind = e.stage === null ? blow.kind : HOLD_STAGE_KINDS[e.stage];
      landBlow(ctx, blow, kind, e.dir, blow.knobs.echo);
      ctx.events.push({ kind: 'runeFx', effect: 'echo', x: h.x, y: h.y, element: blow.element });
    }
  }
}
```

In `packages/engine/src/arpg/abilities/cast.ts`:

Replace:

```ts
  if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;
  return true;
}
```

with:

```ts
  if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;
  // Echo: the move again, as it landed, toward where it landed.
  if (ab.knobs.echo > 0)
    queueEcho(ctx, {
      at: world.t + bal.runes.echoDelay,
      slot,
      ability: ab,
      aim: { x: res.tx, y: res.ty },
      blow: null,
      stage: null,
      dir: null,
    });
  return true;
}
```

Replace:

```ts
import { executeForm } from './forms.js';
```

with:

```ts
import { queueEcho } from './echo.js';
import { executeForm } from './forms.js';
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
  if (landed) h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
```

with:

```ts
  if (landed) h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
  // Echo: the blow again (a held blow at its stage), along its way, from where the hero stands then.
  if (blow.knobs.echo > 0)
    queueEcho(ctx, {
      at: world.t + bal.runes.echoDelay,
      slot: null,
      ability: null,
      aim: null,
      blow: sw.step,
      stage,
      dir,
    });
```

Replace:

```ts
import { surging } from './abilities/defend.js';
```

with:

```ts
import { surging } from './abilities/defend.js';
import { queueEcho } from './abilities/echo.js';
```

In `packages/engine/src/arpg/step.ts`:

Replace:

```ts
  castTick(ctx);
```

with:

```ts
  castTick(ctx);
  echoTick(ctx);
```

Replace:

```ts
import { defendTick, gainCharge, surging } from './abilities/defend.js';
```

with:

```ts
import { defendTick, gainCharge, surging } from './abilities/defend.js';
import { echoTick } from './abilities/echo.js';
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 46 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1512 tests pass and 14 are todo (1526) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/abilities/echo.ts src/arpg/abilities/cast.ts src/arpg/basic.ts src/arpg/step.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/abilities/echo.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): Echo: a move or a blow again after echoDelay, free and never echoing again" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 6: Volatile, Drain and Guard

### Task 11: Volatile: the `catalyst` knob

`react` takes the hit's `catalyst`, and its factor becomes `1 + legendaries.catalyst / 100 + catalyst`: it adds to the Catalyst legendary, scaling what that scales (the damage reactions' bonus per pair, Overload's blast, Soulfire). `hitMonster` marks a damage reaction or Soulfire it scaled with a `runeFx` (`'volatile'`) at the foe. The ten effect reactions don't change.

**Files:**
- Modify: `packages/engine/src/arpg/combat.ts`
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Replace the lines from `import { describe, it, expect } from 'vitest';` up to (not including) `// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  NEUTRAL,
  blowNumbers,
  defaultBasic,
  followBasic,
  mergeKnobs,
} from '../src/arpg/abilities/resolve.js';
import { landBlow } from '../src/arpg/basic.js';
import { applyStatus, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import {
  STEP,
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  holdFor,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  type ArenaOpts,
} from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('Volatile (the catalyst knob)', () => {
  /** The Melt hit of a Fire move or blow on a foe holding 2 Frost stacks, and the events. */
  const melt = (w: ArpgWorld, act: () => ArpgEvent[], legendary = 0) => {
    w.hero.stats.legendaries.catalyst = legendary;
    applyStatus(makeCtx(registry, w, []), w.monsters[0], 'chill', 0, false, undefined, 2);
    const events = act();
    return { events, hit: events.find((e) => e.kind === 'hit' && e.reaction === 'melt')! };
  };
  const bolt = (runes: RuneRef[], legendary = 0) => {
    const w = world([dummy(13, 30)], { primary: { runes } });
    return melt(w, () => [...press(w, 0), ...run(w, 1)], legendary);
  };

  it('adds to the factor of the reactions a move sets off, and marks them', () => {
    // A medium Fire Bolt brings 2 stacks: Melt takes 2 pairs, each adding (2 − 1) × the factor.
    const plain = bolt([]);
    const volatile = bolt([R('volatile')]);
    expect(volatile.hit.amount / plain.hit.amount).toBeCloseTo((1 + 2 * 1.325) / (1 + 2));
    expect(volatile.events.find((e) => e.kind === 'runeFx')).toMatchObject({
      effect: 'volatile',
      element: 'fire',
    });
    expect(plain.events.some((e) => e.kind === 'runeFx')).toBe(false);
  });

  it("adds to the Catalyst legendary's %, rather than multiplying", () => {
    const legendary = bolt([], 20);
    const both = bolt([R('volatile')], 20);
    expect(both.hit.amount / legendary.hit.amount).toBeCloseTo((1 + 2 * 1.525) / (1 + 2 * 1.2));
  });

  it("a blow's reactions too, melee or shot", () => {
    for (const [baseId, y] of [
      ['sword', 34.5],
      ['wand', 32],
    ] as const) {
      const blowMelt = (runes: RuneRef[]) => {
        const w = blowWorld([light(runes)], [dummy(13, y)], {
          weapon: gear('fire', 'weapon', baseId),
        });
        return melt(w, () => [...firstBlow(w), ...run(w, 0.5)]);
      };
      // A light blow brings 1 stack: one pair.
      const ratio = blowMelt([R('volatile')]).hit.amount / blowMelt([]).hit.amount;
      expect(ratio).toBeCloseTo(2.325 / 2);
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 3 failed and 46 passed (49): `expected 1 to be close to 1.2166666666666666`, `expected 1 to be close to 1.1911764705882353` and `expected 1 to be close to 1.1625`.

- [ ] **Step 3: Volatile in `react`**

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
/**
 * A reaction's effect on `m` with `n` pairs, before they come off. Returns the
 * hit's amount after it: a damage reaction adds its bonus once per pair, scaled
 * by Catalyst. `slot`: the hit's ability slot, which its splash carries.
 */
function react(
  ctx: SimCtx,
  m: MonsterEntity,
  id: ReactionId,
  amount: number,
  slot: number | undefined,
  n: number,
): number {
  const r = ctx.bal.reactions;
  const h = ctx.world.hero;
  const t = ctx.world.t;
  const catalyst = 1 + (h.stats.legendaries.catalyst ?? 0) / 100;
```

with:

```ts
/**
 * A reaction's effect on `m` with `n` pairs, before they come off. Returns the
 * hit's amount after it: a damage reaction adds its bonus once per pair, scaled
 * by Catalyst (the legendary's %, plus the hit's Volatile, `volatile`). `slot`:
 * the hit's ability slot, which its splash carries.
 */
function react(
  ctx: SimCtx,
  m: MonsterEntity,
  id: ReactionId,
  amount: number,
  slot: number | undefined,
  n: number,
  volatile: number,
): number {
  const r = ctx.bal.reactions;
  const h = ctx.world.hero;
  const t = ctx.world.t;
  const catalyst = 1 + (h.stats.legendaries.catalyst ?? 0) / 100 + volatile;
```

Replace:

```ts
    amount = react(ctx, m, reaction, amount, opts.slot, pair.n);
```

with:

```ts
    amount = react(ctx, m, reaction, amount, opts.slot, pair.n, opts.catalyst ?? 0);
```

Replace:

```ts
    noteReaction(ctx, reaction, m, pair.n);
```

with:

```ts
    noteReaction(ctx, reaction, m, pair.n);
    // Volatile marks a reaction it scaled: a damage reaction, or Soulfire.
    if (opts.catalyst && (DAMAGE_REACTIONS.has(reaction) || reaction === 'soulfire'))
      ctx.events.push({ kind: 'runeFx', effect: 'volatile', x: m.x, y: m.y, element });
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 49 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1515 tests pass and 14 are todo (1529) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/combat.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/combat.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): Volatile: the hit's catalyst adds to the Catalyst legendary's factor in react" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 12: Drain: the `manaOnHit` knob

`hitMonster` gives a `basic` or `skill` hit's `manaOnHit` while the cast's budget lasts: `HeroEntity.drained[slot ?? 3]` counts foe-hits (the same foe again counts again: direct hits, ticks, jumps and shards alike; burns, poisons and reaction splashes are other sources and never count) up to `drainFoes`. `fire` resets its slot's count before `executeForm` (a Lance's or a Strike's hits land inside it), and `strike` the basic attack's before its blow lands.

**Files:**
- Modify: `packages/engine/src/arpg/combat.ts`
- Modify: `packages/engine/src/arpg/abilities/cast.ts`
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Append at the end of the file:

```ts
describe('Drain (the manaOnHit knob)', () => {
  const pack = [
    dummy(10, 33),
    dummy(11.5, 33),
    dummy(13, 33),
    dummy(14.5, 33),
    dummy(16, 33),
    dummy(11, 31),
    dummy(15, 31),
  ];

  it('an ability: mana per foe hit, up to drainFoes foe-hits a cast', () => {
    const nova = (runes: RuneRef[]) => {
      const w = world(pack, { ultimate: { payment: 'mana', runes } });
      const events = press(w, 2);
      return { mana: w.hero.mana, hits: skillHits(events, 2).length };
    };
    const plain = nova([]);
    const drain = nova([R('drain')]);
    expect(drain.hits).toBe(7);
    expect(drain.mana - plain.mana).toBeCloseTo(bal.runes.drainFoes * 2);
  });

  it('counts from before the cast’s hits land: a new cast has its own budget', () => {
    const lance = (runes: RuneRef[]) => {
      const w = world([dummy(13, 33), dummy(13, 31), dummy(13, 29)], {
        primary: { form: 'lance', runes },
      });
      w.hero.drained[0] = bal.runes.drainFoes;
      press(w, 0);
      return w.hero.mana;
    };
    expect(lance([R('drain')]) - lance([])).toBeCloseTo(3 * 2);
  });

  it('a blow: mana per foe struck, its budget reset as it lands', () => {
    const blow = (runes: RuneRef[]) => {
      const w = blowWorld([light(runes)]);
      w.hero.mana = 0;
      w.hero.drained[3] = bal.runes.drainFoes;
      firstBlow(w);
      return { mana: w.hero.mana, drained: w.hero.drained[3] };
    };
    const plain = blow([]);
    const drain = blow([R('drain')]);
    expect(drain.mana - plain.mana).toBeCloseTo(2);
    expect(drain.drained).toBe(1);
  });

  it('counts foe-hits, not foes: the same foe hit again counts again', () => {
    const volley = (runes: RuneRef[]) => {
      const w = world([dummy(13, 30)], { primary: { form: 'volley', runes } });
      w.hero.mana = 20;
      const events = [...press(w, 0), ...run(w, 1)];
      return { mana: w.hero.mana, hits: skillHits(events).length };
    };
    const drain = volley([R('drain')]);
    expect(drain.hits).toBe(3);
    expect(drain.mana - volley([]).mana).toBeCloseTo(3 * 2);
  });

  it('a shot blow: mana for the foe its shot hits', () => {
    const shot = (runes: RuneRef[]) => {
      const w = blowWorld([light(runes)], [dummy(13, 30)], {
        weapon: gear('fire', 'weapon', 'wand'),
      });
      w.hero.mana = 0;
      firstBlow(w);
      until(w, 'hit');
      return w.hero.mana;
    };
    expect(shot([R('drain')]) - shot([])).toBeCloseTo(2);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 5 failed and 49 passed (54): `expected +0 to be close to 10`, `expected +0 to be close to 6` (twice) and `expected +0 to be close to 2` (twice): no mana from hits.

- [ ] **Step 3: Drain in `hitMonster`, and the resets**

In `packages/engine/src/arpg/combat.ts`:

Replace:

```ts
    if (leech > 0) healHero(ctx, amount * leech, 'lifesteal');
    addCharge(ctx, amount, opts.slot);
  }
```

with:

```ts
    if (leech > 0) healHero(ctx, amount * leech, 'lifesteal');
    addCharge(ctx, amount, opts.slot);
    // Drain: mana per foe hit while the cast's budget lasts (`drainFoes` foe-hits since its
    // skill last fired; the basic attack's at index 3).
    const drain = opts.slot ?? 3;
    if (opts.manaOnHit && h.drained[drain] < bal.runes.drainFoes) {
      h.drained[drain]++;
      h.mana = Math.min(h.manaMax, h.mana + opts.manaOnHit);
    }
  }
```

In `packages/engine/src/arpg/abilities/cast.ts`:

Replace:

```ts
  const res = executeForm(ctx, ab, aim);
```

with:

```ts
  // Drain's budget is the cast's: it counts from before the move's hits land.
  h.drained[slot] = 0;
  const res = executeForm(ctx, ab, aim);
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
  const landed = landBlow(ctx, blow, kind, dir, 1, {
```

with:

```ts
  // Drain's budget is the blow's: it counts from before its hits land.
  h.drained[3] = 0;
  const landed = landBlow(ctx, blow, kind, dir, 1, {
```

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 54 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1520 tests pass and 14 are todo (1534) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/combat.ts src/arpg/abilities/cast.ts src/arpg/basic.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/combat.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/basic.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): Drain: mana per foe-hit, drainFoes a cast, reset before the cast's hits" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 13: Guard: the `guardOnLand` knob

`guardLand` (wave 0's stub) puts up a barrier of `guardOnLand × maxHp` for `guardSeconds`, as Obsidian's (it soaks after the Defensive's reductions and before the Ward, in `shieldHero`); it never keeps a larger barrier alive: holding at least the barrier's life left (or with none up) it sets the barrier to its value for a fresh `guardSeconds`, else it does nothing. `fire` calls it when a move lands (the Defensive's too), `strike` when a blow lands (a melee blow that connects, a shot fired at a foe in range: the `landed` that grants mana). With every stub and placeholder of 1A's built, wave 0's `it.todo` block for 1A goes.

**Files:**
- Modify: `packages/engine/src/arpg/abilities/defend.ts`
- Modify: `packages/engine/src/arpg/abilities/cast.ts`
- Modify: `packages/engine/src/arpg/basic.ts`
- Modify: `packages/engine/tests/delve-runes-contract.test.ts` (wave 0's: see Cross-area needs, 2)
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Replace the lines from `import { describe, it, expect } from 'vitest';` up to (not including) `// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  NEUTRAL,
  blowNumbers,
  defaultBasic,
  followBasic,
  mergeKnobs,
} from '../src/arpg/abilities/resolve.js';
import { landBlow } from '../src/arpg/basic.js';
import { applyStatus, hurtHero, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import {
  STEP,
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  holdFor,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  type ArenaOpts,
} from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('Guard (the guardOnLand knob)', () => {
  it("an ability that fires puts up a barrier of its share of max life for guardSeconds (the Defensive's too)", () => {
    const w = world([dummy(13, 30)], { primary: { runes: [R('guard', 5)] } });
    press(w, 0);
    expect(w.hero.barrier).toEqual({
      hp: w.hero.stats.maxHp * 0.08,
      max: w.hero.stats.maxHp * 0.08,
      until: w.t + bal.runes.guardSeconds,
    });
    const ward = world([], { defensive: { runes: [R('guard')] } });
    press(ward, 1);
    expect(ward.hero.barrier?.hp).toBeCloseTo(ward.hero.stats.maxHp * 0.055);
    // It soaks a hit before the hero's life.
    const life = w.hero.hp;
    hurtHero(makeCtx(registry, w, []), 1, null, null, { unavoidable: true });
    expect(w.hero.hp).toBe(life);
    expect(w.hero.barrier!.hp).toBeCloseTo(w.hero.stats.maxHp * 0.08 - 1);
  });

  it('never keeps a larger barrier alive; a smaller one takes its value for a fresh guardSeconds', () => {
    const cast = (share: number) => {
      const w = world([dummy(13, 30)], { primary: { runes: [R('guard', 5)] } });
      const hp = w.hero.stats.maxHp * share;
      w.hero.barrier = { hp, max: hp, until: 1 };
      press(w, 0);
      return { w, barrier: w.hero.barrier! };
    };
    expect(cast(0.3).barrier).toMatchObject({ until: 1 });
    const small = cast(0.01);
    expect(small.barrier.hp).toBeCloseTo(small.w.hero.stats.maxHp * 0.08);
    expect(small.barrier.until).toBeCloseTo(small.w.t + bal.runes.guardSeconds);
  });

  it('a melee blow when it connects; a whiff puts up none', () => {
    const hit = blowWorld([light([R('guard')])]);
    firstBlow(hit);
    expect(hit.hero.barrier?.hp).toBeCloseTo(hit.hero.stats.maxHp * 0.055);
    const whiff = blowWorld([light([R('guard')])], []);
    const events: ArpgEvent[] = [];
    for (let i = 0; i < 60 && !events.some((e) => e.kind === 'basic'); i++)
      events.push(...stepWorld(registry, whiff, { move: { x: 0, y: 0 }, attack: true }, STEP));
    expect(events.some((e) => e.kind === 'basic')).toBe(true);
    expect(whiff.hero.barrier).toBeNull();
  });

  it('a shot blow when it fires at a foe in range', () => {
    const w = blowWorld([light([R('guard')])], [dummy(13, 30)], {
      weapon: gear('fire', 'weapon', 'bow'),
    });
    firstBlow(w);
    expect(w.hero.barrier?.hp).toBeCloseTo(w.hero.stats.maxHp * 0.055);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: FAIL, 4 failed and 54 passed (58): `expected null to deeply equal { hp: 12.32, max: 12.32, until: 3.2 }`, `expected 1.54 to be close to 12.32` and `expected undefined to be close to 6.6` (twice).

- [ ] **Step 3: `guardLand`, its calls, and the todo block**

In `packages/engine/src/arpg/abilities/defend.ts`:

Replace:

```ts
/**
 * Guard: on landing, a shield of `guardOnLand` × max life for
 * `delve.runes.guardSeconds`, fed into Obsidian's barrier (see the runes spec).
 */
export function guardLand(_ctx: SimCtx, _knobs: Knobs): void {
  throw new Error('not built yet');
}
```

with:

```ts
/**
 * Guard (`guardOnLand`): a move or a blow that lands puts up a shield of that
 * fraction of max life for `delve.runes.guardSeconds`, as Obsidian's barrier
 * (it soaks after the Defensive's reductions and before the Ward). It never
 * keeps a larger barrier alive: holding at least the barrier's life left (or
 * with none up), it sets the barrier to its value for a fresh `guardSeconds`;
 * against a larger one it does nothing.
 */
export function guardLand(ctx: SimCtx, knobs: Knobs): void {
  if (knobs.guardOnLand <= 0) return;
  const h = ctx.world.hero;
  const hp = h.stats.maxHp * knobs.guardOnLand;
  if (h.barrier && h.barrier.hp > hp) return;
  h.barrier = { hp, max: hp, until: ctx.world.t + ctx.bal.runes.guardSeconds };
}
```

In `packages/engine/src/arpg/abilities/cast.ts`:

Replace:

```ts
  if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;
  // Echo: the move again, as it landed, toward where it landed.
```

with:

```ts
  if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;
  guardLand(ctx, ab.knobs);
  // Echo: the move again, as it landed, toward where it landed.
```

Replace:

```ts
import { queueEcho } from './echo.js';
```

with:

```ts
import { guardLand } from './defend.js';
import { queueEcho } from './echo.js';
```

In `packages/engine/src/arpg/basic.ts`:

Replace:

```ts
  if (landed) h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
```

with:

```ts
  if (landed) {
    h.mana = Math.min(h.manaMax, h.mana + bal.mana.basicAttackGain);
    guardLand(ctx, blow.knobs);
  }
```

Replace:

```ts
import { surging } from './abilities/defend.js';
```

with:

```ts
import { guardLand, surging } from './abilities/defend.js';
```

In `packages/engine/tests/delve-runes-contract.test.ts`:

Delete the lines from `// Stubs in wave 0 ("not built yet"); wave 1A builds them and may delete these lines.` up to (not including) `describe('save v7', () => {`.

- [ ] **Step 4: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 58 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1524 tests pass and 10 are todo (1534) in 80 files.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write src/arpg/abilities/defend.ts src/arpg/abilities/cast.ts src/arpg/basic.ts tests/delve-runes-contract.test.ts tests/delve-rune-sim.test.ts)
git add packages/engine/src/arpg/abilities/defend.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/basic.ts packages/engine/tests/delve-runes-contract.test.ts packages/engine/tests/delve-rune-sim.test.ts
git commit -m "feat(engine): Guard: a barrier on landing that never keeps a larger one alive" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 7: Nothing changes without runes

### Task 14: With no rune acting, nothing changes

A guard over Tasks 1–13: a ten-second fight that bites back (real foes, basics on their own, every skill pressed in turn) plays out event for event the same with no sockets, with empty sockets on every move and blow, and with runes that don't act (a Pierce on an Earth Bolt, and on a Ward and a Nova it doesn't fit; Split on a sword's blows). It passes as written: Tasks 1–13 keep every neutral path bit-identical.

**Files:**
- Modify: `packages/engine/tests/delve-rune-sim.test.ts`

- [ ] **Step 1: Write the guard test**

In `packages/engine/tests/delve-rune-sim.test.ts`:

Replace the lines from `import { describe, it, expect } from 'vitest';` up to (not including) `// See the runes spec, "Each rune in the sim". The fixture arena's hero stands at (13, 36) facing` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  NEUTRAL,
  blowNumbers,
  defaultBasic,
  followBasic,
  mergeKnobs,
} from '../src/arpg/abilities/resolve.js';
import { landBlow } from '../src/arpg/basic.js';
import { applyStatus, hurtHero, makeCtx } from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import type { RuneRef, RuneTier } from '../src/types/rune.js';
import {
  STEP,
  arena,
  bal,
  chainsWith,
  dummy,
  firstBlow,
  gear,
  holdFor,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  type ArenaOpts,
} from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('with no rune acting, nothing changes', () => {
  it('a fixed-seed fight plays out the same with empty sockets and dormant runes as with none', () => {
    /** Ten seconds of a fight that bites back: basics on their own, every skill pressed in turn. */
    const fight = (sockets: (move: 'bolt' | 'basic') => (RuneRef | null)[] | undefined) => {
      const chains = chainsWith({
        primary: { elements: ['earth'], runes: sockets('bolt') },
        defensive: { runes: sockets('bolt') },
        ultimate: { payment: 'mana', runes: sockets('bolt') },
      });
      const w = arena(
        [
          { x: 11, y: 28 },
          { x: 15, y: 27 },
          { x: 13, y: 24 },
        ],
        { chains },
      );
      const basic = defaultBasic(registry, 'sword', 'fire').map((b) => ({
        ...b,
        runes: sockets('basic'),
      }));
      w.hero.stats = computeHeroStats(SWORD, registry, { basic });
      const events: ArpgEvent[] = [];
      for (let i = 0; i < Math.round(10 / STEP); i++) {
        const cast = i % 45 === 0 ? { slot: (i / 45) % 3 } : null;
        events.push(...stepWorld(registry, w, { move: { x: 0, y: 0 }, cast }, STEP));
      }
      return JSON.stringify(events);
    };
    const none = fight(() => undefined);
    expect(fight(() => [null, null, null])).toBe(none);
    // Pierce on an Earth Bolt (and on a Ward and a Nova, which it doesn't fit), Split on a
    // sword's blows: none of them acts.
    expect(fight((m) => (m === 'bolt' ? [R('pierce'), null] : [R('split')]))).toBe(none);
  });
});
```

- [ ] **Step 2: Run them**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS already, 59 tests: this task adds a guard, not a feature.

- [ ] **Step 3: Run the tests, the suite and the typecheck**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-sim.test.ts)`
Expected: PASS, 59 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1525 tests pass and 10 are todo (1535) in 80 files.

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/alloy-sim
(cd packages/engine && npx prettier --write tests/delve-rune-sim.test.ts)
git add packages/engine/tests/delve-rune-sim.test.ts
git commit -m "test(engine): a fight plays out the same with empty sockets and dormant runes as with none" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 8: Verification

### Task 15: Verification: the suite green, every number unchanged without runes

No commit (nothing in the repo changes).

- [ ] **Step 1: The suite and the typecheck**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1525 passed and 10 todo (1535) in 80 files.

- [ ] **Step 2: Build the measuring copy**

Run: `(cd packages/engine && npx tsup --out-dir node_modules/.runes-1a-measure)`
Expected: the build succeeds (`index.js` and `index.cjs` in `node_modules/.runes-1a-measure`, which git ignores).

- [ ] **Step 3: The DPS Lab grid, against wave 0's "before"**

```bash
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
M=C:/Projects/alloy-sim/packages/engine/node_modules/.runes-1a-measure/index.js
mkdir -p $S/runes-1a
node $S/runes-before/snapshot.mjs $M $S/runes-1a/after-depth10.json
node $S/runes-before/identical.mjs $S/runes-before/before-depth10.json $S/runes-1a/after-depth10.json
```

Expected: `runs 9144 ms …` from the first, then `rows 9144 before, 9144 after; differing 0`.

- [ ] **Step 4: The pacing, the first dives and the items hash**

```bash
node $S/runes-before/pacing.mjs $M > $S/runes-1a/pacing-after.txt && diff $S/runes-before/pacing-before.txt $S/runes-1a/pacing-after.txt && echo PACING-SAME
node $S/runes-before/first-dives.mjs $M > $S/runes-1a/first-dives-after.txt && diff $S/runes-before/first-dives-before.txt $S/runes-1a/first-dives-after.txt && echo FIRST-DIVES-SAME
node $S/runes-before/items-hash.mjs $M > $S/runes-1a/items-hash-after.txt && diff $S/runes-before/items-hash-before.txt $S/runes-1a/items-hash-after.txt && echo ITEMS-SAME
```

Expected: `PACING-SAME`, `FIRST-DIVES-SAME`, `ITEMS-SAME`, and no diff lines. Any difference is a regression in a neutral path: find the task that made it (the measuring build at each task's commit) and report it; never adjust the "before" files.

- [ ] **Step 5: Remove the measuring copy**

Run: `rm -rf packages/engine/node_modules/.runes-1a-measure`
Expected: `git status` shows a clean tree on `runes/sim`, 14 commits ahead of `b216703`.
