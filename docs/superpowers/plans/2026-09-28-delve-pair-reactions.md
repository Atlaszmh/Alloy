# Delve Pair Reactions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every pair of the six elements a reaction, set off both ways: a hit of either element on a foe carrying the other's mark (its status; Earth's is a new `rattled`). The seven existing reactions gain their reverse triggers; eight new ones (Obsidian, Lightning Rod, Sunder, Seedling, Siphon, Crystallize, Blackout, Galvanize) give their pairs a defense, mobility, debuff, sustain, resource, burst, area-defense or tempo role, each with its own look in the arena.

**Architecture:** The engine owns every rule. `arpg.json`'s reactions become the one table (`elements`, `consumes`, `cooldown`), checked by one exported `ReactionIdSchema` (the save uses it too) and refined to cover the 15 pairs exactly once; `registry.getReactionFor(a, b)` finds a pair's reaction. In `arpg/combat.ts`, `hasMark` reads each element's mark, and `hitMonster`'s if/else chain becomes `findReaction` (the first other mark in `MANA_TYPES` order whose reaction can fire now), `useUpMark` and `react` (one `switch` over the 15 effects). Earth's mark is `StatusState.rattledUntil`, set by a stagger from a source that includes Earth (`HitOpts.rattles`, carried by abilities, basic blows and their shots, and Defensive retaliation). Obsidian's barrier is `HeroEntity.barrier`, soaked in a reworked `shieldHero`; the five buff reactions wait `reactionCooldown` (`HeroEntity.reactionReadyAt`). The autopilot binds by attunement again and can force a pair, and the pacing gate sweeps all 15 pairs. The client only draws: `REACTION_HEX` and a data-driven label, a new `arena/fx/reactions.ts` for the moment each new reaction fires, the lasting states in `draw-world.ts`, a sprout for Seedling's orb, the HUD's barrier segment and Galvanize spark (from the snapshot), a sound for the barrier breaking, and a vine stamp on the pixel floor.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), React 19, Zod 3, PixiJS 8 (drawing only), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-delve-pair-reactions-design.md` (the requirements; read it first). It follows `docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md` (v0.43.x): the hero's pair, basic blows striking with the primary while the combo's finisher discharges the secondary.

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available (use it for process management). Run any Python helper script from a file (not a heredoc) with `PYTHONIOENCODING=utf-8`.
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). **One commit per task.** Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; the commit blocks below pass it as the last `-m`.
- Stage files by path. Never `git add -A` or `git add .` at the repo root: three unrelated untracked plan docs (`docs/superpowers/plans/2026-05-01-*.md`) exist and must stay out.
- Don't push: the user pushes after a final review. Never open a PR.
- **The engine is rebuilt once, in Task 13**, with `(cd packages/engine && pnpm build)`. Chunks 1–4 change engine `src` and run only engine checks; don't build before Task 13 (the user plays on the 5288 dev server, and the client only compiles against the new engine once Task 13 adds the new reactions' colours). If you must rebuild later (a tuning fix), restart the dev server after.
- `tests/delve-pacing.test.ts` is the balance gate: it must pass at the end of Chunk 4 (Task 12) and stay green after. Each engine task ends by running its own test files and the typecheck, then **the whole engine suite** `(cd packages/engine && npx vitest run)`: expect all green (it was, on the scratch copy, after every task). Before Task 12 a red `delve-pacing.test.ts` alone isn't a blocker: note it and go on, since Task 12 judges it; anything else red is.
- **Run every command from the repo root.** The shell's working directory persists between commands, so every command line below runs in a subshell (`(cd packages/engine && npx vitest run …)`), and every commit block starts with `cd /c/Projects/Alloy`.
- **Prettier:** the commit blocks format only files a task creates, or files that pass `npx prettier --check` before the edit. These existing files are not clean at HEAD (checked for every file this plan touches): edit them by hand in their existing style and never format them: `packages/engine/src/data/registry.ts`, `packages/engine/src/delve/profile-schema.ts`, `packages/engine/src/delve/autopilot.ts`, `packages/engine/tests/delve-pacing.test.ts`. Every other existing file this plan edits passed `npx prettier --check` at HEAD; before formatting one, check it still passes before your edit, and never commit a whole-file reformat. Never run Prettier on a folder, JSON data files or Markdown; edit JSON by hand, keeping its one-line-per-entry layout.
- **Line endings:** those four files, `CLAUDE.md` and the spec use CRLF; every other file here is LF. Keep each file's endings (the Edit tool does; don't rewrite a file with a script that normalises them).
- `arpg/combat.ts` and `arpg/abilities/defend.ts` import each other's functions (a function-level cycle): only ever call an import inside a function, never at module top level.
- Engine `tsc` covers `src` only; client `tsc` covers `src` including tests, so client test code must type-check.
- Geometry the engine tests rely on: the fixture arena's hero starts at (13, 36) facing up (−y); `dummy(x, y)` is a sturdy foe (1e6 life) that doesn't fight back; the fixture's foes resist fire (their element); a sword reaches 1.9, a staff 8.5; the fixture hero's Defensive is a Frost Ward and its Ultimate a charge-paid Fire Nova.
- The numbers below were measured on a scratch copy of this exact code before the plan was written (the sim is deterministic, so you should see the same).

**Commands:**

| What | Command (from repo root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine build | `(cd packages/engine && pnpm build)` |
| Client typecheck + tests | `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` |
| One client test file | `(cd packages/client && npx vitest run <path>)` |
| E2E | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts <specs>)` |

**Dev server on 5288** (PowerShell; stops whatever owns the port, starts a detached Vite, waits for a 200 and prints `True`; leave it running when done):

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\Alloy\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5288 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5288').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

**E2E scratch config** (Tasks 19–20; create it when needed, delete it at the end, never commit it): `packages/client/playwright.scratch.config.ts`

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

A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness. A consistent failure is a regression: debug it with logging and the page's state, not guesses or longer timeouts.

## File map

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/types/arpg.ts` | `ReactionId` gains the eight; `ReactionDef` gains `elements`, `consumes?`, `cooldown?`; `StatusState.rattledUntil`, `sunderUntil`; `Projectile.rattles?`; `HeroEntity.barrier`, `quickUntil`, `reactionReadyAt`; the `barrierBreak` event |
| `src/types/delve.ts` | `DelveBalance.status.rattleDuration`; the new numbers in `DelveBalance.reactions` |
| `src/data/arpg.json` | 15 reactions with `elements` (and `consumes` / `cooldown`), each text naming both elements |
| `src/data/balance.json` | `delve.status.rattleDuration`; the new numbers in `delve.reactions` |
| `src/data/schemas.ts` | exported `ReactionIdSchema`, with a compile-time check that it names the same ids as `ReactionId`; the reactions refined to cover the 15 pairs once; the balance numbers |
| `src/data/registry.ts` | `getReactionFor(a, b)` |
| `src/delve/profile-schema.ts` | `DelveProfileSchema.reactionsSeen` takes every id (v3 stays frozen at seven) |
| `src/arpg/combat.ts` | `HitOpts.rattles`; `isRattled`, `isSundered`, `hasMark`; `applyStatus(…, rattles)`; `nearby`, `findReaction`, `useUpMark`, `react` replace the chain; buff cooldowns; Sunder's bonus; `spawnDrop`'s `vacuum` |
| `src/arpg/abilities/impact.ts` | `hitOpts` sets `rattles` |
| `src/arpg/basic.ts` | `strike`'s `rattles` (blows and shots); `burstShot` passes it |
| `src/arpg/step.ts` | the projectile hit passes `rattles`; the barrier lapses; Lightning Rod's pace |
| `src/arpg/abilities/defend.ts` | retaliation rattles; `shieldHero` reworked around the barrier |
| `src/arpg/dodge.ts` | `refundDodgeCharge` (`notePerfect` uses it) |
| `src/arpg/world.ts` | `emptyStatus` and `createHeroEntity` start the new fields |
| `src/arpg/sandbox.ts` | `respawnHero` clears them; the "drops nothing" doc's exception |
| `src/delve/autopilot.ts` | `REACTION_PAIRS` goes: `bindBest` by attunement again; `AutopilotOptions.secondary` |
| `tests/delve-reactions.test.ts` (new) | every engine test for this feature |
| `tests/fixtures/arena.ts` | `strikeWorld` and `firstBlow`, moved from `delve-pair.test.ts` to share |
| `tests/delve-pair.test.ts` | imports the moved helpers; the autopilot's bind tests |
| `tests/delve-infusion.test.ts` | a fused ability's second hit now sets off Overload |
| `tests/delve-pacing.test.ts` | the reactions rail reads the pair; the 15-pair sweep |

**Client (`packages/client/`)**

| File | Change |
|---|---|
| `package.json` | version `0.44.0` |
| `src/features/delve/arena/palette.ts` | `REACTION_HEX` gains 8 colours |
| `src/features/delve/arena/fx/reactions.ts` (new) | `reactionLabel`, `reactionFx`, `barrierBreakFx`, `EMBER`, `OBSIDIAN` |
| `src/features/delve/arena/ArenaRenderer.ts` | `REACTION_LABEL` goes; the `reaction` and `barrierBreak` cases; `drawDrop` exported (Seedling's sprout, which doesn't bob); `pickupColor` (the sprout's pickup sparkles green) |
| `src/features/delve/arena/fx/draw-world.ts` | Obsidian's shell and Lightning Rod's trail (`drawGuard`); rattle chips, Sunder's crack, blind smoke (`drawMonsterMarks`) |
| `src/features/delve/arena/arena-sounds.ts` | `barrierBreak` plays `orbRemove` |
| `src/features/delve/arena/useArenaCore.ts` | `ArenaHud.barrier`, `galvanizedAt`, `t`; `snapshot` |
| `src/features/delve/arena/ArenaHud.tsx` | the life bar's barrier segment; the Galvanize spark |
| `src/features/delve/arena/pixel/arena-effects.ts` | Seedling's vine stamp |
| tests | `arena/fx/__tests__/reactions.test.ts` (new); `__tests__/{AbilitiesPanel.test.tsx, arena-sounds.test.ts, arena-renderer.test.ts, arena-hud-snapshot.test.ts, ArenaHud.test.tsx, pixel-world.test.ts}` |
| `e2e/delve.spec.ts` | D04: 15 reactions to discover |

`AbilitiesPanel.tsx`, `training/MeterView.tsx`, `TrainingPanel.tsx`, `DelveRun.tsx`'s discovery toast and `pixel/floor-engine.ts` need no edit: they read `arpg.json`'s reactions or pass every `hit` event through.

**Docs:** `CLAUDE.md` (the reactions line, a Pair reactions bullet, the Training Grounds' drops), the spec's status line.

---

## Chunk 1: Engine: the reaction table, the numbers and the marks

### Task 1: The reaction table: fifteen pairs, one id list, and saves that keep them

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`ReactionId`, `ReactionDef`)
- Modify: `packages/engine/src/data/schemas.ts` (`ReactionIdSchema`, `ArpgDataSchema.reactions`)
- Modify: `packages/engine/src/data/arpg.json` (`reactions`)
- Modify: `packages/engine/src/data/registry.ts` (`getReactionFor`; CRLF, not Prettier-clean: hand-edit)
- Modify: `packages/engine/src/delve/profile-schema.ts` (`DelveProfileSchema`; CRLF, not Prettier-clean: hand-edit)
- Create: `packages/engine/tests/delve-reactions.test.ts`

- [ ] **Step 0: Commit the plan**

If `git status` shows this plan untracked, commit it first so every later commit stays about code:

```bash
cd /c/Projects/Alloy
git add docs/superpowers/plans/2026-09-28-delve-pair-reactions.md
git commit -m "docs: Delve pair reactions plan" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/tests/delve-reactions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import arpgJson from '../src/data/arpg.json';
import { ArpgDataSchema } from '../src/data/schemas.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { MANA_TYPES } from '../src/types/mana.js';
import { registry } from './fixtures/arena.js';

describe('the reaction table', () => {
  it('has one reaction per pair of elements, found in either order', () => {
    expect(registry.getArpgData().reactions).toHaveLength(15);
    for (const a of MANA_TYPES)
      for (const b of MANA_TYPES) {
        if (a === b) continue;
        const r = registry.getReactionFor(a, b);
        expect([...r.elements].sort()).toEqual([a, b].sort());
        expect(registry.getReactionFor(b, a)).toBe(r);
      }
    expect(registry.getReactionFor('earth', 'storm').name).toBe('Lightning Rod');
  });

  it('Soulfire and Blight keep their mark; the five buff reactions have a cooldown', () => {
    const reactions = registry.getArpgData().reactions;
    expect(reactions.filter((r) => r.consumes === false).map((r) => r.id)).toEqual([
      'soulfire',
      'blight',
    ]);
    expect(reactions.filter((r) => r.cooldown).map((r) => r.id)).toEqual([
      'obsidian',
      'lightning_rod',
      'seedling',
      'siphon',
      'galvanize',
    ]);
  });

  it('refuses a reaction set that misses or repeats a pair', () => {
    expect(ArpgDataSchema.safeParse(arpgJson).success).toBe(true);
    const repeat = arpgJson.reactions.map((r) =>
      r.id === 'galvanize' ? { ...r, elements: ['fire', 'frost'] } : r,
    );
    expect(ArpgDataSchema.safeParse({ ...arpgJson, reactions: repeat }).success).toBe(false);
    const missing = arpgJson.reactions.filter((r) => r.id !== 'galvanize');
    expect(ArpgDataSchema.safeParse({ ...arpgJson, reactions: missing }).success).toBe(false);
  });
});

describe('saves remember every reaction', () => {
  it('a version 4 save that has seen a new reaction parses', () => {
    const p = {
      ...createDelveProfile(registry, 1),
      reactionsSeen: ['melt', 'sunder', 'lightning_rod'],
    };
    expect(
      parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))?.profile.reactionsSeen,
    ).toEqual(['melt', 'sunder', 'lightning_rod']);
  });

  it('a version 3 save with the seven still migrates', () => {
    const fresh = createDelveProfile(registry, 1, { primary: 'fire' });
    const { pair: _pair, manaDust: _dust, ...rest } = fresh;
    const v3 = { ...rest, version: 3, reactionsSeen: ['melt', 'blight'] };
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(v3)))?.profile).toMatchObject({
      version: 4,
      reactionsSeen: ['melt', 'blight'],
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts)`
Expected: 4 FAIL, 1 pass: "expected [ …(7) ] to have a length of 15 but got 7"; `consumes` filters to `[]`; the repeated set still parses ("expected true to be false"); the v4 save with `sunder` doesn't parse at all (`undefined`: the version 4 schema inherits version 3's seven ids, and nothing else accepts it). The v3 migration already passes (it guards that case from here on).

- [ ] **Step 3: The types**

In `src/types/arpg.ts`, the `ReactionId` union: `  | 'blight';` becomes

```ts
  | 'blight'
  | 'obsidian'
  | 'lightning_rod'
  | 'sunder'
  | 'seedling'
  | 'siphon'
  | 'crystallize'
  | 'blackout'
  | 'galvanize';
```

and the `ReactionDef` interface becomes

```ts
/** A hit of either element on a foe carrying the other's mark sets it off (see the pair reactions spec). */
export interface ReactionDef {
  id: ReactionId;
  elements: [ManaType, ManaType];
  name: string;
  icon: string;
  text: string;
  /** False: the mark that set it off stays (Soulfire, Blight). */
  consumes?: false;
  /** A buff reaction: after it fires it can't again for `reactionCooldown` seconds. */
  cooldown?: true;
}
```

- [ ] **Step 4: One id list, and the schema's pair check**

In `src/data/schemas.ts`, just above `function perRarity<T extends z.ZodTypeAny>(schema: T) {`, add:

```ts
/** Every reaction id: arpg.json's reactions and the save's `reactionsSeen` both check against it. */
export const ReactionIdSchema = z.enum([
  'melt',
  'shatter',
  'overload',
  'superconduct',
  'soulfire',
  'combust',
  'blight',
  'obsidian',
  'lightning_rod',
  'sunder',
  'seedling',
  'siphon',
  'crystallize',
  'blackout',
  'galvanize',
]);
// The ReactionId union and this list must name the same ids: this stops compiling if they drift.
type SameIds<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
true satisfies SameIds<ReactionId, z.infer<typeof ReactionIdSchema>>;

```

and at the top, after `import { z } from 'zod';`, add `import type { ReactionId } from '../types/arpg.js';`. (The check lives in `src` because engine `tsc` covers `src` only and Vitest doesn't type-check, so a type assertion in a test would never run. `tsup` strips the `satisfies` line.)

In `ArpgDataSchema`, replace the `reactions: z.array(z.object({ id: z.enum([…seven ids…]), name, icon, text })).length(7),` entry (it runs from `  reactions: z` to `    .length(7),`) with:

```ts
  reactions: z
    .array(
      z.object({
        id: ReactionIdSchema,
        elements: z
          .tuple([ManaTypeSchema, ManaTypeSchema])
          .refine(([a, b]) => a !== b, 'a reaction needs two elements'),
        name: z.string(),
        icon: z.string(),
        text: z.string(),
        consumes: z.literal(false).optional(),
        cooldown: z.literal(true).optional(),
      }),
    )
    .length(15)
    .refine((rs) => new Set(rs.map((r) => r.id)).size === rs.length, 'reaction ids must differ')
    .refine(
      (rs) => new Set(rs.map((r) => [...r.elements].sort().join('+'))).size === rs.length,
      'each pair of elements needs exactly one reaction',
    ),
```

(Fifteen distinct pairs of six elements are all of them, so the two refines cover the pairs exactly once.)

- [ ] **Step 5: The fifteen in `arpg.json`**

In `src/data/arpg.json`, replace the whole `"reactions": [ … ],` block (the seven one-line entries) with the fifteen below, one entry per line. The seven keep their texts until Task 4 turns them both ways; the eight new texts already name both elements.

```json
  "reactions": [
    { "id": "melt", "elements": ["fire", "frost"], "name": "Melt", "icon": "🫠", "text": "Fire hits a chilled or frozen foe for double damage." },
    { "id": "shatter", "elements": ["earth", "frost"], "name": "Shatter", "icon": "💥", "text": "Earth hits a frozen foe for massive bonus damage." },
    { "id": "overload", "elements": ["storm", "fire"], "name": "Overload", "icon": "💢", "text": "Storm hits a burning foe and it explodes, hitting everything nearby." },
    { "id": "superconduct", "elements": ["frost", "storm"], "name": "Superconduct", "icon": "🔷", "text": "Frost hits a shocked foe and freezes it solid." },
    { "id": "soulfire", "elements": ["fire", "shadow"], "consumes": false, "name": "Soulfire", "icon": "💜", "text": "Fire hits a hexed foe and part of the damage heals you." },
    { "id": "combust", "elements": ["fire", "nature"], "name": "Combust", "icon": "💚", "text": "Fire hits a poisoned foe and the poison detonates around it." },
    { "id": "blight", "elements": ["shadow", "nature"], "consumes": false, "name": "Blight", "icon": "🦠", "text": "Shadow hits a poisoned foe and its poison spreads to its neighbours." },
    { "id": "obsidian", "elements": ["fire", "earth"], "cooldown": true, "name": "Obsidian", "icon": "🪨", "text": "Fire and Earth meet: obsidian hardens around you, a barrier worth half the hit." },
    { "id": "lightning_rod", "elements": ["storm", "earth"], "cooldown": true, "name": "Lightning Rod", "icon": "🌩️", "text": "Storm and Earth meet: the charge grounds through you, giving back a dodge and quickening your step." },
    { "id": "sunder", "elements": ["earth", "shadow"], "name": "Sunder", "icon": "⛏️", "text": "Earth and Shadow meet: the foe is sundered, taking more damage from every hit that follows." },
    { "id": "seedling", "elements": ["earth", "nature"], "cooldown": true, "name": "Seedling", "icon": "🪴", "text": "Earth and Nature meet: a healing seedling sprouts where the foe stands." },
    { "id": "siphon", "elements": ["frost", "shadow"], "cooldown": true, "name": "Siphon", "icon": "🌀", "text": "Frost and Shadow meet: motes of mana tear loose from the foe and fly to you." },
    { "id": "crystallize", "elements": ["frost", "nature"], "name": "Crystallize", "icon": "💎", "text": "Frost and Nature meet: the foe crystallizes for heavy damage, and the shards chill foes nearby." },
    { "id": "blackout", "elements": ["storm", "shadow"], "name": "Blackout", "icon": "🌫️", "text": "Storm and Shadow meet: a cloud of darkness blinds the foe and everything near it." },
    { "id": "galvanize", "elements": ["storm", "nature"], "cooldown": true, "name": "Galvanize", "icon": "🔋", "text": "Storm and Nature meet: your abilities surge, charging up and cooling down faster." }
  ],
```

- [ ] **Step 6: `getReactionFor`, and saves that take every id**

`src/data/registry.ts` (CRLF; hand-edit): just above `  getReaction(id: string): ReactionDef {`, add

```ts
  /** The reaction of a pair of distinct elements, in either order. */
  getReactionFor(a: ManaType, b: ManaType): ReactionDef {
    const reaction = this.getArpgData().reactions.find(
      (r) => a !== b && r.elements.includes(a) && r.elements.includes(b),
    );
    if (!reaction) throw new Error(`No reaction for ${a} + ${b}`);
    return reaction;
  }

```

(`ManaType` and `ReactionDef` are already imported.)

`src/delve/profile-schema.ts` (CRLF; hand-edit):
- `import { HeroStatKeySchema as StatKeySchema, ManaTypeSchema } from '../data/schemas.js';` becomes

  ```ts
  import {
    HeroStatKeySchema as StatKeySchema,
    ManaTypeSchema,
    ReactionIdSchema,
  } from '../data/schemas.js';
  ```

- In `export const DelveProfileSchema = DelveProfileV3Schema.extend({ … });`, after `  manaDust: z.number().int().min(0),` add

  ```ts
    // Every reaction (the frozen version 3 keeps its seven).
    reactionsSeen: z.array(ReactionIdSchema),
  ```

`DelveProfileV3Schema` (and `DelveProfileV2Schema`, built from it) keep their seven ids, so older saves still parse and migrate. No save version bump: ids already seen don't change.

- [ ] **Step 7: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts tests/delve-profile-abilities.test.ts tests/data.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors. (Nothing reacts differently yet: `hitMonster`'s chain still fires only the seven, one way.)

To see the id check bite, delete `  'galvanize',` from `ReactionIdSchema` and rerun `(cd packages/engine && npx tsc --noEmit -p .)`: it fails with "error TS1360: Type 'true' does not satisfy the expected type 'false'." Put the line back.

- [ ] **Step 8: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/data/schemas.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/data/schemas.ts packages/engine/src/data/arpg.json packages/engine/src/data/registry.ts packages/engine/src/delve/profile-schema.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): a reaction for every pair of elements, in one table the save checks too" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The new numbers

**Files:**
- Modify: `packages/engine/src/data/balance.json` (`delve.status`, `delve.reactions`)
- Modify: `packages/engine/src/data/schemas.ts` (`DelveBalanceSchema`)
- Modify: `packages/engine/src/types/delve.ts` (`DelveBalance`)
- Test: `packages/engine/tests/delve-reactions.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/delve-reactions.test.ts`, `import { registry } from './fixtures/arena.js';` becomes `import { bal, registry } from './fixtures/arena.js';`, and before `describe('saves remember every reaction', () => {` add:

```ts
describe('balance: the reactions', () => {
  it("loads the new eight's numbers, their cooldown and Earth's rattle", () => {
    expect(bal.reactions).toMatchObject({
      obsidianSoak: 0.5,
      obsidianCap: 0.3,
      obsidianDuration: 5,
      lightningRodDuration: 2,
      lightningRodMove: 0.3,
      sunderDuration: 4,
      sunderBonus: 0.25,
      seedlingHeal: 0.08,
      siphonMana: 0.15,
      crystallizeMult: 1.8,
      crystallizeRadius: 2,
      blackoutRadius: 2.5,
      galvanizeSeconds: 1,
      reactionCooldown: 1.5,
    });
    expect(bal.status.rattleDuration).toBe(2);
  });
});

```

- [ ] **Step 2: Run it to verify it fails**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts)`
Expected: FAIL ("expected { meltMult: 2, shatterMult: 2.5, …(7) } to match object { obsidianSoak: 0.5, …(13) }": Zod strips unknown keys, and there are none yet).

- [ ] **Step 3: Implement**

`src/data/balance.json`, in `delve.status`, the line `      "shockBonus": 0.2, "shockDuration": 4, "hexBonus": 0.15, "hexDuration": 6, "staggerDuration": 0.6,` becomes

```json
      "shockBonus": 0.2, "shockDuration": 4, "hexBonus": 0.15, "hexDuration": 6, "staggerDuration": 0.6, "rattleDuration": 2,
```

and in `delve.reactions`, the line `      "combustMult": 1.6, "combustRadius": 2, "blightRadius": 2.5` becomes

```json
      "combustMult": 1.6, "combustRadius": 2, "blightRadius": 2.5,
      "obsidianSoak": 0.5, "obsidianCap": 0.3, "obsidianDuration": 5, "lightningRodDuration": 2, "lightningRodMove": 0.3,
      "sunderDuration": 4, "sunderBonus": 0.25, "seedlingHeal": 0.08, "siphonMana": 0.15,
      "crystallizeMult": 1.8, "crystallizeRadius": 2, "blackoutRadius": 2.5, "galvanizeSeconds": 1, "reactionCooldown": 1.5
```

`src/data/schemas.ts`, in `DelveBalanceSchema`:
- in `status`, after `    staggerDuration: z.number().positive(),` add `    rattleDuration: z.number().positive(),`;
- in `reactions`, after `    blightRadius: z.number().positive(),` add

  ```ts
      obsidianSoak: z.number().min(0),
      obsidianCap: z.number().min(0).max(1),
      obsidianDuration: z.number().positive(),
      lightningRodDuration: z.number().positive(),
      lightningRodMove: z.number().min(0),
      sunderDuration: z.number().positive(),
      sunderBonus: z.number().min(0),
      seedlingHeal: z.number().min(0).max(1),
      siphonMana: z.number().min(0).max(1),
      crystallizeMult: z.number().positive(),
      crystallizeRadius: z.number().positive(),
      blackoutRadius: z.number().positive(),
      galvanizeSeconds: z.number().min(0),
      reactionCooldown: z.number().min(0),
  ```

`src/types/delve.ts`, in `DelveBalance`:
- in `status`, after `    staggerDuration: number;` add

  ```ts
      /** Seconds Earth's mark (rattled) lasts after an Earth source staggers a foe. */
      rattleDuration: number;
  ```

- in `reactions`, after `    blightRadius: number;` add

  ```ts
      /** Obsidian: a barrier worth this share of the hit, capped at `obsidianCap` × max life, for `obsidianDuration` s. */
      obsidianSoak: number;
      obsidianCap: number;
      obsidianDuration: number;
      /** Lightning Rod: a dodge charge back, and movement × (1 + `lightningRodMove`) for `lightningRodDuration` s. */
      lightningRodDuration: number;
      lightningRodMove: number;
      /** Sunder: every later hit on the foe deals × (1 + `sunderBonus`) for `sunderDuration` s. */
      sunderDuration: number;
      sunderBonus: number;
      /** Seedling: a health orb worth this share of max life. */
      seedlingHeal: number;
      /** Siphon: three motes worth this share of the mana pool between them. */
      siphonMana: number;
      /** Crystallize: the hit × this, and one chill stack on foes within `crystallizeRadius`. */
      crystallizeMult: number;
      crystallizeRadius: number;
      /** Blackout: the foe and foes within this radius are blinded. */
      blackoutRadius: number;
      /** Galvanize: seconds off each ability still cooling down (a charge slot gains a unit instead). */
      galvanizeSeconds: number;
      /** Seconds before a buff reaction (Obsidian, Lightning Rod, Seedling, Siphon, Galvanize) can fire again. */
      reactionCooldown: number;
  ```

- [ ] **Step 4: Run to verify it passes**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts tests/balance-schema.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/data/schemas.ts packages/engine/src/types/delve.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/data/balance.json packages/engine/src/data/schemas.ts packages/engine/src/types/delve.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): balance for the new reactions and Earth's rattle" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Marks, and Earth's rattle

Earth's mark can't be the 0.6 s stagger, so it is `rattledUntil`, set by a stagger from any source that includes Earth: an ability with Earth in either slot, an Earth blow or discharge (and its shot), any blow under an Earth Surge, and an Earth Defensive's retaliation. Crushing weight, a non-Earth blow's stagger (the Maul's slam) and the riposte stagger without rattling.

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`StatusState.rattledUntil`, `Projectile.rattles`)
- Modify: `packages/engine/src/arpg/world.ts` (`emptyStatus`)
- Modify: `packages/engine/src/arpg/combat.ts` (`HitOpts.rattles`, `isRattled`, `hasMark`, `applyStatus`, `hitMonster`'s status loop)
- Modify: `packages/engine/src/arpg/abilities/impact.ts` (`hitOpts`)
- Modify: `packages/engine/src/arpg/basic.ts` (`strike`, `burstShot`)
- Modify: `packages/engine/src/arpg/step.ts` (the projectile hit)
- Modify: `packages/engine/src/arpg/abilities/defend.ts` (`shieldHero`'s retaliation)
- Modify: `packages/engine/tests/fixtures/arena.ts`, `packages/engine/tests/delve-pair.test.ts` (move `strikeWorld` and `firstBlow` into the fixtures)
- Test: `packages/engine/tests/delve-reactions.test.ts`

- [ ] **Step 1: Share the basic-attack helpers**

`tests/delve-pair.test.ts` has two helpers inside `describe('basic attacks with a pair', …)` that the new tests need too. Move them into the fixtures.

In `tests/fixtures/arena.ts`, `import { computeHeroStats } from '../../src/delve/hero-stats.js';` becomes `import { computeHeroStats, type HeroStatsExtra } from '../../src/delve/hero-stats.js';`, and just above the doc comment `` /** Press dodge (moving along `move`, or standing still) and advance one step. */ `` add:

```ts
/**
 * One sturdy foe (in a sword's reach by default), the hero's stats from `extra`;
 * `finisher` starts on the string's last blow.
 */
export function strikeWorld(
  equipped: EquippedGear,
  extra: HeroStatsExtra,
  finisher = false,
  foe: Partial<MonsterEntity> = dummy(13, 34.5),
): ArpgWorld {
  const w = arena([foe], { equipped });
  w.hero.stats = computeHeroStats(equipped, registry, extra);
  if (finisher) {
    w.hero.attackCount = w.hero.stats.weapon.combo.length - 1;
    w.hero.lastBasicAt = 0;
  }
  return w;
}

/** Step until the first blow lands (its `basic` event), returning every event. */
export function firstBlow(w: ArpgWorld): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < 300 && !events.some((e) => e.kind === 'basic'); i++)
    events.push(...run(w, STEP));
  return events;
}

```

In `tests/delve-pair.test.ts`:
- delete the two local helpers (from the doc comment `` /** One sturdy foe (in a sword's reach by default), the hero on `extra`; … `` through `firstBlow`'s closing `  }` and the blank line after it);
- `import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';` becomes `import type { ArpgEvent } from '../src/types/arpg.js';`;
- in the `../src/types/gear.js` import, delete the line `  type EquippedGear,`;
- `import { STEP, arena, bal, dummy, gear, registry, run } from './fixtures/arena.js';` becomes `import { bal, dummy, firstBlow, gear, registry, run, strikeWorld } from './fixtures/arena.js';`.

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: PASS (the same tests, the helpers now imported).

- [ ] **Step 2: Write the failing tests**

In `tests/delve-reactions.test.ts`, replace the imports with:

```ts
import { describe, it, expect } from 'vitest';
import arpgJson from '../src/data/arpg.json';
import { ArpgDataSchema } from '../src/data/schemas.js';
import { applyStatus, hasMark, hitMonster, isRattled, makeCtx } from '../src/arpg/combat.js';
import { shieldHero } from '../src/arpg/abilities/defend.js';
import { hitOpts } from '../src/arpg/abilities/impact.js';
import { resolveAbility } from '../src/arpg/abilities/resolve.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import { MANA_TYPES } from '../src/types/mana.js';
import {
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  registry,
  run,
  strikeWorld,
  type ArenaOpts,
} from './fixtures/arena.js';

/** Sturdy foes (one at (13, 20) by default), the hero's basic attack stopped; `m` is the first. */
function setup(monsters: Partial<MonsterEntity>[] = [dummy(13, 20)], opts: ArenaOpts = {}) {
  const w = arena(monsters, { noBasic: true, ...opts });
  const events: ArpgEvent[] = [];
  return { w, events, ctx: makeCtx(registry, w, events), m: w.monsters[0] };
}

/** Whether the world's first foe is rattled now. */
const rattled = (w: ArpgWorld) => isRattled(makeCtx(registry, w, []), w.monsters[0]);
```

and before `describe('saves remember every reaction', () => {` add:

```ts
describe('marks', () => {
  it("each element's mark is its status: frost is chilled or frozen, earth is rattled", () => {
    const { ctx, m } = setup();
    const marks = () => MANA_TYPES.filter((e) => hasMark(ctx, m, e));
    expect(marks()).toEqual([]);
    applyStatus(ctx, m, 'burn', 10);
    applyStatus(ctx, m, 'shock', 0);
    applyStatus(ctx, m, 'hex', 0);
    expect(marks()).toEqual(['fire', 'storm', 'shadow']);
    applyStatus(ctx, m, 'freeze', 0);
    applyStatus(ctx, m, 'stagger', 0, true);
    applyStatus(ctx, m, 'poison', 10);
    expect(marks()).toEqual([...MANA_TYPES]);
  });

  it('an Earth stagger rattles, even when immunity refuses the stagger; it lapses after rattleDuration', () => {
    const { w, ctx, m } = setup([dummy(13, 20), dummy(16, 20)]);
    const plain = w.monsters[1];
    m.status.staggerImmuneUntil = 1e9;
    applyStatus(ctx, m, 'stagger', 0, true);
    expect(m.status.staggerUntil).toBe(0);
    expect(m.status.rattledUntil).toBeCloseTo(w.t + bal.status.rattleDuration);
    applyStatus(ctx, plain, 'stagger', 0);
    expect(plain.status.staggerUntil).toBeGreaterThan(w.t);
    expect(isRattled(ctx, plain)).toBe(false);
    run(w, bal.status.rattleDuration + 0.1);
    expect(isRattled(ctx, m)).toBe(false);
  });

  it("a fused ability with Earth second rattles, and so does an Earth finisher's discharge", () => {
    const { w, ctx, m } = setup([dummy(13, 20)], { primary: { elements: ['fire', 'earth'] } });
    const opts = hitOpts(w.hero.abilities[0], { x: 13, y: 20 });
    expect(opts.rattles).toBe(true);
    hitMonster(ctx, m, 10, 'fire', opts);
    expect(isRattled(ctx, m)).toBe(true);

    const fin = strikeWorld(
      { weapon: gear('fire') },
      { pair: { primary: 'fire', secondary: 'earth' } },
      true,
    );
    firstBlow(fin);
    expect(rattled(fin)).toBe(true);
  });

  it('a ranged Earth blow rattles, its shot and its burst, and so does any blow under an Earth Surge', () => {
    const shot = strikeWorld(
      { weapon: gear('earth', 'weapon', 'staff') },
      { pair: { primary: 'earth', secondary: null } },
      false,
      dummy(13, 30),
    );
    firstBlow(shot);
    const p = shot.projectiles.find((q) => q.owner === 'hero')!;
    expect(p).toMatchObject({ element: 'earth', rattles: true });
    p.applies = ['stagger']; // its 18% roll, made certain
    shot.hero.nextAttackAt = 1e9;
    run(shot, 1);
    expect(rattled(shot)).toBe(true);

    const burst = strikeWorld(
      { weapon: gear('fire', 'weapon', 'staff') },
      { pair: { primary: 'fire', secondary: 'earth' } },
      true,
      dummy(13, 30),
    );
    firstBlow(burst);
    burst.hero.nextAttackAt = 1e9;
    run(burst, 1);
    expect(rattled(burst)).toBe(true);

    const surge = strikeWorld(
      { weapon: gear('fire') },
      { pair: { primary: 'fire', secondary: null } },
    );
    const build = { form: 'surge', elements: ['earth'], weight: 0, payment: 'mana' } as const;
    surge.hero.abilities[1] = resolveAbility(registry, 'defensive', build, surge.hero.stats);
    surge.hero.defend = { form: 'surge', until: 1e9 };
    firstBlow(surge);
    expect(rattled(surge)).toBe(true);
  });

  it("a Maul finisher discharging a non-Earth secondary, Crushing weight and a riposte stagger but don't rattle", () => {
    const maul = strikeWorld(
      { weapon: gear('earth', 'weapon', 'maul') },
      { pair: { primary: 'earth', secondary: 'fire' } },
      true,
    );
    firstBlow(maul);
    expect(maul.monsters[0].status.staggerUntil).toBeGreaterThan(maul.t);
    expect(rattled(maul)).toBe(false);

    const heavy = setup([dummy(13, 20)], { primary: { weight: 2 } });
    const opts = hitOpts(heavy.w.hero.abilities[0], { x: 13, y: 20 });
    hitMonster(heavy.ctx, heavy.m, 10, 'fire', opts);
    expect(heavy.m.status.staggerUntil).toBeGreaterThan(heavy.w.t);
    expect(isRattled(heavy.ctx, heavy.m)).toBe(false);

    // An Earth source's hit with no statuses of its own: only the riposte staggers, without a rattle.
    const riposte = setup();
    riposte.w.hero.riposteUntil = 1e9;
    const earthHit = { source: 'skill', canCrit: true, rattles: true } as const;
    hitMonster(riposte.ctx, riposte.m, 10, 'earth', earthHit);
    expect(riposte.m.status.staggerUntil).toBeGreaterThan(riposte.w.t);
    expect(isRattled(riposte.ctx, riposte.m)).toBe(false);
  });

  it("an Earth Defensive's retaliation rattles, with Earth first or second", () => {
    const cases = [
      ['armor', ['earth', 'fire']],
      ['ward', ['fire', 'earth']],
    ] as const;
    for (const [form, elements] of cases) {
      const { w, ctx, m } = setup([dummy(13, 35)], { defensive: { form, elements: [...elements] } });
      w.hero.defend = { form, until: 1e9 };
      shieldHero(ctx, 10, m, true);
      expect(isRattled(ctx, m), form).toBe(true);
    }
  });
});

```

- [ ] **Step 3: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts)`
Expected: the six `marks` tests FAIL (`hasMark` / `isRattled` "is not a function", `rattledUntil` undefined, `opts.rattles` undefined, the shot has no `rattles`).

- [ ] **Step 4: The types and the empty status**

`src/types/arpg.ts`:
- in `StatusState`, after `  staggerUntil: number;` add

  ```ts
    /** Earth's mark: an Earth source staggered the foe (even if immunity refused the stagger). */
    rattledUntil: number;
  ```

- in `Projectile`, after `  heft?: number;` (the one just before `  dead: boolean;`) add

  ```ts
    /** A basic shot from an Earth source: its stagger rattles (see `HitOpts.rattles`). */
    rattles?: boolean;
  ```

`src/arpg/world.ts`, `emptyStatus()`: after `    staggerUntil: 0,` add `    rattledUntil: 0,`.

- [ ] **Step 5: `hasMark`, and staggers that rattle**

`src/arpg/combat.ts`:
- `HitOpts`: after the `heft?: number;` member (and its doc) add

  ```ts
    /** The source includes Earth: a stagger it applies rattles the foe (Earth's mark). */
    rattles?: boolean;
  ```

- after the `isRooted` function, add

  ```ts
  export function isRattled(ctx: SimCtx, m: MonsterEntity): boolean {
    return ctx.world.t < m.status.rattledUntil;
  }

  /** Whether `m` carries `element`'s mark: the status a reaction of that element needs. */
  export function hasMark(ctx: SimCtx, m: MonsterEntity, element: ManaType): boolean {
    switch (element) {
      case 'fire':
        return isBurning(ctx, m);
      case 'frost':
        return isChilled(ctx, m) || isFrozen(ctx, m);
      case 'storm':
        return isShocked(ctx, m);
      case 'earth':
        return isRattled(ctx, m);
      case 'shadow':
        return isHexed(ctx, m);
      case 'nature':
        return isPoisoned(ctx, m);
    }
  }
  ```

- `applyStatus`: its signature becomes

  ```ts
  /** Apply `status`; with `rattles` (an Earth source) a stagger also rattles the foe. */
  export function applyStatus(
    ctx: SimCtx,
    m: MonsterEntity,
    status: StatusId,
    hitAmount: number,
    rattles = false,
  ): void {
  ```

  and its `case 'stagger':` starts

  ```ts
      case 'stagger':
        // Earth's mark outlasts the stagger, and immunity doesn't refuse it.
        if (rattles) s.rattledUntil = t + st.rattleDuration;
        if (t < s.staggerImmuneUntil) break;
  ```

- `hitMonster`: `  for (const s of opts.applies ?? []) applyStatus(ctx, m, s, amount);` becomes `  for (const s of opts.applies ?? []) applyStatus(ctx, m, s, amount, opts.rattles);` (the riposte's stagger on the next line stays without it).

- [ ] **Step 6: Who rattles**

`src/arpg/abilities/impact.ts`, `hitOpts`'s returned object: after `    heft: direct ? heft : 0,` add

```ts
    // Either element counts: an ability applies both elements' statuses.
    rattles: ab.elements.includes('earth'),
```

`src/arpg/basic.ts`, `strike`:
- after `  if (s.stagger && !applies.includes('stagger')) applies.push('stagger');` add

  ```ts
    // An Earth blow (a discharge included) or an Earth Surge's statuses: its stagger rattles.
    const rattles = element === 'earth' || !!surge?.elements.includes('earth');
  ```

- the melee hit `      hitMonster(ctx, m, base, element, { source: 'basic', crit, applies, heft: s.heft, ...kb });` becomes

  ```ts
        hitMonster(ctx, m, base, element, {
          source: 'basic',
          crit,
          applies,
          heft: s.heft,
          rattles,
          ...kb,
        });
  ```

  (Twin Fang's extra hit applies nothing, so it needs no flag.)
- in the ranged branch's `spawnProjectile(ctx, { … })`, its last lines

  ```ts
          applies,
          knockback: 0,
          heft: s.heft,
        });
  ```

  become

  ```ts
          applies,
          knockback: 0,
          heft: s.heft,
          rattles,
        });
  ```

  (`knockback: 0,` is only there, so the anchor is unique whichever edit you make first.)

`burstShot`'s `hitMonster(ctx, m, p.damage, p.element, { … })`: after `      heft: p.heft ?? 0,` add `      rattles: p.rattles,`.

`src/arpg/step.ts`, `projectilesTick`, the basic shot's `hitMonster(ctx, m, p.damage, p.element, { … })`: after `          heft: p.heft ?? 0,` add `          rattles: p.rattles,`.

`src/arpg/abilities/defend.ts`, `shieldHero`, the retaliation block becomes

```ts
  if (melee && source && !source.dead) {
    const rattles = ab.elements.includes('earth');
    if (form === 'armor') {
      hitMonster(ctx, source, abilityHit(ctx, ab), ab.element, {
        source: 'skill',
        applies: ab.knobs.applies,
        leech: ab.knobs.lifesteal,
        slot: DEFENSIVE,
        rattles,
      });
    } else {
      for (const s of ab.knobs.applies)
        if (!source.dead) applyStatus(ctx, source, s, abilityHit(ctx, ab) * 0.5, rattles);
    }
  }
```

(Crushing weight's `heavyStagger` only adds a stagger to abilities without Earth, whose `rattles` is false; the riposte's stagger never passes the flag, even on an Earth source's hit, and a non-Earth blow's `stagger` never has it.)

- [ ] **Step 7: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts tests/delve-pair.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/abilities/defend.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/abilities/defend.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): every element's mark, and Earth sources rattle what they stagger" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 2: Engine: the reaction lookup

### Task 4: One lookup for every pair, both ways (the seven first)

`hitMonster`'s if/else chain becomes three small functions: `findReaction` walks the foe's marks in `MANA_TYPES` order (fire, frost, storm, earth, shadow, nature) and takes the first other element's whose reaction can fire now (an Earth hit needs a freeze to Shatter); `useUpMark` clears that mark (Shatter and Superconduct clear part of theirs; Soulfire and Blight none); `react` runs the effect. This task gives `react` the seven existing effects; the eight new ids fall to its `default` until Chunk 3. Blight now spreads hex as well as poison (`spreadAffliction`), and each text names both elements.

**Files:**
- Modify: `packages/engine/src/arpg/combat.ts` (imports; `nearby`, `findReaction`, `useUpMark`, `react`; `hitMonster`)
- Modify: `packages/engine/src/data/arpg.json` (the seven texts)
- Modify: `packages/engine/tests/delve-infusion.test.ts` (a fused ability's second hit now reacts)
- Test: `packages/engine/tests/delve-reactions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-reactions.test.ts`, replace the imports and helpers above `describe('the reaction table', …)` with:

```ts
import { describe, it, expect } from 'vitest';
import arpgJson from '../src/data/arpg.json';
import { ArpgDataSchema } from '../src/data/schemas.js';
import {
  applyStatus,
  hasMark,
  hitMonster,
  isBurning,
  isChilled,
  isFrozen,
  isHexed,
  isPoisoned,
  isRattled,
  isShocked,
  makeCtx,
  type SimCtx,
} from '../src/arpg/combat.js';
import { BASIC_STATUS } from '../src/arpg/basic.js';
import { shieldHero } from '../src/arpg/abilities/defend.js';
import { hitOpts } from '../src/arpg/abilities/impact.js';
import { resolveAbility } from '../src/arpg/abilities/resolve.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import type { ArpgEvent, ArpgWorld, MonsterEntity, ReactionId } from '../src/types/arpg.js';
import { MANA_TYPES, type ManaType } from '../src/types/mana.js';
import {
  arena,
  bal,
  dummy,
  firstBlow,
  gear,
  registry,
  run,
  strikeWorld,
  type ArenaOpts,
} from './fixtures/arena.js';

/** Sturdy foes (one at (13, 20) by default), the hero's basic attack stopped; `m` is the first. */
function setup(monsters: Partial<MonsterEntity>[] = [dummy(13, 20)], opts: ArenaOpts = {}) {
  const w = arena(monsters, { noBasic: true, ...opts });
  const events: ArpgEvent[] = [];
  return { w, events, ctx: makeCtx(registry, w, events), m: w.monsters[0] };
}

/** Whether the world's first foe is rattled now. */
const rattled = (w: ArpgWorld) => isRattled(makeCtx(registry, w, []), w.monsters[0]);

/** The reactions that fired. */
const reactions = (events: ArpgEvent[]) =>
  events.flatMap((e) => (e.kind === 'reaction' ? [e.reaction] : []));

/** Give `m` `element`'s mark (frost: chilled and frozen, so Earth can Shatter). */
function mark(ctx: SimCtx, m: MonsterEntity, element: ManaType): void {
  applyStatus(ctx, m, BASIC_STATUS[element], 100, true);
  if (element === 'frost') applyStatus(ctx, m, 'freeze', 0);
}

/** A hit of `hit` on a foe marked by `marked`, with a neighbour 1.5 away (inside every radius). */
interface Fired extends ReturnType<typeof setup> {
  o: MonsterEntity;
  hit: ManaType;
  marked: ManaType;
  /** What the reacting hit dealt, and the same hit on an unmarked foe. */
  dealt: number;
  plain: number;
}

function fire(
  hit: ManaType,
  marked: ManaType,
  before?: (s: ReturnType<typeof setup>) => void,
): Fired {
  const s = setup([dummy(13, 20), dummy(14.5, 20)]);
  before?.(s);
  mark(s.ctx, s.m, marked);
  const dealt = hitMonster(s.ctx, s.m, 100, hit, { source: 'skill' });
  const twin = setup([dummy(13, 20), dummy(14.5, 20)]);
  const plain = hitMonster(twin.ctx, twin.m, 100, hit, { source: 'skill' });
  return { ...s, o: s.w.monsters[1], hit, marked, dealt, plain };
}

/** What each reaction does, checked from either side. */
const EFFECTS: Partial<Record<ReactionId, (f: Fired) => void>> = {
  melt: (f) => expect(f.dealt / f.plain).toBeCloseTo(bal.reactions.meltMult),
  shatter: (f) => expect(f.dealt / f.plain).toBeCloseTo(bal.reactions.shatterMult),
  overload: (f) => {
    expect(f.o.hp).toBeLessThan(f.o.maxHp);
    expect(f.events).toContainEqual(
      expect.objectContaining({
        kind: 'explode',
        element: 'storm',
        radius: bal.reactions.overloadRadius,
      }),
    );
  },
  superconduct: (f) => expect(isFrozen(f.ctx, f.m)).toBe(true),
  soulfire: (f) =>
    expect(f.events).toContainEqual({
      kind: 'heal',
      amount: expect.closeTo(f.dealt * bal.reactions.soulfireHeal, 6),
      source: 'soulfire',
    }),
  combust: (f) => {
    expect(f.dealt / f.plain).toBeCloseTo(bal.reactions.combustMult);
    expect(f.o.hp).toBeLessThan(f.o.maxHp);
  },
  blight: (f) => {
    // Each affliction spreads only if the foe has it: no empty poison from a hexed foe.
    if (f.marked === 'nature') expect(isPoisoned(f.ctx, f.o)).toBe(true);
    else expect(f.o.status.poisonUntil).toBe(0);
    expect(isHexed(f.ctx, f.o)).toBe(f.marked === 'shadow');
  },
};
```

(The fixture's foes resist fire and are weak to frost, so a damage multiplier is checked as a ratio against the same hit on an unmarked twin. None of these marks changes a hit's damage by itself, so the ratio is the multiplier.)

Then, before `describe('saves remember every reaction', () => {`, add:

```ts
describe('every pair reacts, both ways', () => {
  const cases = registry
    .getArpgData()
    .reactions.filter((r) => EFFECTS[r.id])
    .flatMap((r) => [
      [r.id, r.elements[0], r.elements[1]] as const,
      [r.id, r.elements[1], r.elements[0]] as const,
    ]);

  it.each(cases)('%s: %s hits, %s marked', (id, hit, marked) => {
    // Room for each effect to show: a heal (Soulfire), a dodge to give back (Lightning Rod),
    // a cooldown to cut (Galvanize).
    const f = fire(hit, marked, (s) => {
      s.w.hero.hp = 1;
      s.w.hero.dodgeCharges = 0;
      s.w.hero.cooldowns[0] = 5;
    });
    expect(reactions(f.events)).toEqual([id]);
    const { ctx, m } = f;
    if (id === 'soulfire' || id === 'blight') expect(hasMark(ctx, m, marked)).toBe(true);
    else if (id === 'shatter' && hit === 'earth') {
      // Earth breaks the freeze and leaves the chill.
      expect(isFrozen(ctx, m)).toBe(false);
      expect(isChilled(ctx, m)).toBe(true);
    } else if (id === 'superconduct' && hit === 'storm') {
      // Storm takes the chill and leaves the freeze (freezing again would be refused).
      expect(isChilled(ctx, m)).toBe(false);
      expect(m.status.chillStacks).toBe(0);
      expect(isFrozen(ctx, m)).toBe(true);
    } else expect(hasMark(ctx, m, marked)).toBe(false);
    EFFECTS[id]!(f);
  });

  it("each reaction's text names both its elements", () => {
    const data = registry.getArpgData();
    for (const r of data.reactions)
      for (const e of r.elements) expect(r.text, r.id).toContain(data.mana[e].name);
  });

  it('an element on its own mark, or a noReact hit, fires nothing and keeps the mark', () => {
    for (const e of MANA_TYPES) {
      const { ctx, m, events } = setup();
      mark(ctx, m, e);
      hitMonster(ctx, m, 10, e, { source: 'skill' });
      expect(reactions(events), e).toEqual([]);
      expect(hasMark(ctx, m, e), e).toBe(true);
    }
    const { ctx, m, events } = setup();
    mark(ctx, m, 'fire');
    hitMonster(ctx, m, 10, 'storm', { source: 'reaction', noReact: true }); // an Overload splash
    hitMonster(ctx, m, 10, 'nature', { source: 'dot', noReact: true }); // a poison tick
    expect(reactions(events)).toEqual([]);
    expect(isBurning(ctx, m)).toBe(true);
  });

  it("Earth doesn't Shatter a merely chilled foe; Frost Shatters a rattled one, frozen or not", () => {
    const chilled = setup();
    applyStatus(chilled.ctx, chilled.m, 'chill', 0);
    hitMonster(chilled.ctx, chilled.m, 10, 'earth', { source: 'skill' });
    expect(reactions(chilled.events)).toEqual([]);
    expect(isChilled(chilled.ctx, chilled.m)).toBe(true);
    const shaken = setup();
    applyStatus(shaken.ctx, shaken.m, 'stagger', 0, true);
    hitMonster(shaken.ctx, shaken.m, 10, 'frost', { source: 'skill' });
    expect(reactions(shaken.events)).toEqual(['shatter']);
  });

  it('Storm on a merely chilled foe: Superconduct freezes it', () => {
    const { ctx, m, events } = setup();
    applyStatus(ctx, m, 'chill', 0);
    hitMonster(ctx, m, 10, 'storm', { source: 'skill' });
    expect(reactions(events)).toEqual(['superconduct']);
    expect(isChilled(ctx, m)).toBe(false);
    expect(isFrozen(ctx, m)).toBe(true);
  });

  it("Catalyst scales the damage reactions and Soulfire's hit", () => {
    const cases = [
      ['fire', 'frost'],
      ['earth', 'frost'],
      ['fire', 'shadow'],
    ] as const;
    for (const [hit, marked] of cases) {
      const plain = fire(hit, marked);
      const doubled = fire(hit, marked, (s) => (s.w.hero.stats.legendaries.catalyst = 100));
      expect(doubled.dealt / plain.dealt, `${hit} on ${marked}`).toBeCloseTo(2);
    }
  });

  it('with two marks, the first in MANA_TYPES order decides', () => {
    const a = setup();
    applyStatus(a.ctx, a.m, 'poison', 100);
    applyStatus(a.ctx, a.m, 'hex', 0);
    hitMonster(a.ctx, a.m, 10, 'fire', { source: 'skill' });
    expect(reactions(a.events)).toEqual(['soulfire']); // shadow before nature: not Combust
    const b = setup();
    applyStatus(b.ctx, b.m, 'shock', 0);
    applyStatus(b.ctx, b.m, 'burn', 100);
    hitMonster(b.ctx, b.m, 10, 'frost', { source: 'skill' });
    expect(reactions(b.events)).toEqual(['melt']); // fire before storm
    expect(isBurning(b.ctx, b.m)).toBe(false);
    expect(isShocked(b.ctx, b.m)).toBe(true);
  });
});

```

The table covers the reactions `EFFECTS` names: the seven now; each new reaction's task adds its entry. (The table is the spec's "Superconduct reverse" and "Blight reverse" tests too: Storm on a frozen foe keeps the freeze; Nature on a hexed, unpoisoned foe spreads hex and no poison, not even an empty one: `isPoisoned` needs stacks, so the test reads `poisonUntil`. Catalyst 100 doubles a reaction's multiplier, so each of Melt, Shatter and Soulfire deals twice the uncatalysed reaction.)

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts)`
Expected: 11 FAIL: each of the seven's reverse direction ("expected [] to deeply equal [ 'melt' ]", and the same for shatter, overload, superconduct, soulfire, combust and blight), the texts ("melt: expected 'Fire hits a chilled or frozen foe for…' to contain 'Frost'"), Frost on a rattled foe ("expected [] to deeply equal [ 'shatter' ]"), Storm on a chilled foe ("expected [] to deeply equal [ 'superconduct' ]"), and the two marks ("expected [ 'combust' ] to deeply equal [ 'soulfire' ]"). The seven's forward directions, the own-mark and noReact test, and Catalyst already pass (the old chain already multiplies these three by Catalyst: they guard it from here on).

- [ ] **Step 3: Implement the lookup**

In `src/arpg/combat.ts`:
- In the `../types/arpg.js` type import, add `  ReactionDef,` before `  ReactionId,`.
- `import type { ManaType } from '../types/mana.js';` becomes `import { MANA_TYPES, type ManaType } from '../types/mana.js';`.
- After the `noteReaction` function, add:

```ts
/** Every other living foe within `radius` of `m` (edge to centre, as Overload always measured). */
function nearby(ctx: SimCtx, m: MonsterEntity, radius: number): MonsterEntity[] {
  return ctx.world.monsters.filter(
    (o) => !o.dead && o.id !== m.id && dist(o.x, o.y, m.x, m.y) <= radius + o.radius,
  );
}

/**
 * The reaction a hit of `element` sets off on `m`: the first other element's
 * mark on it, in MANA_TYPES order, whose reaction can fire now; else null.
 */
function findReaction(
  ctx: SimCtx,
  m: MonsterEntity,
  element: ManaType,
): { def: ReactionDef; mark: ManaType } | null {
  for (const mark of MANA_TYPES) {
    if (mark === element || !hasMark(ctx, m, mark)) continue;
    // Earth shatters a freeze, not a mere chill.
    if (element === 'earth' && mark === 'frost' && !isFrozen(ctx, m)) continue;
    return { def: ctx.registry.getReactionFor(element, mark), mark };
  }
  return null;
}

/**
 * Clear the mark that set `reaction` off. Earth's Shatter breaks only the
 * freeze; Storm's Superconduct takes only the chill (the freeze it would
 * add again is refused by immunity, so the foe stays frozen).
 */
function useUpMark(m: MonsterEntity, mark: ManaType, reaction: ReactionId): void {
  const s = m.status;
  switch (mark) {
    case 'fire':
      s.burnUntil = 0;
      break;
    case 'frost':
      if (reaction !== 'shatter') {
        s.chillUntil = 0;
        s.chillStacks = 0;
      }
      if (reaction !== 'superconduct') s.freezeUntil = 0;
      break;
    case 'storm':
      s.shockUntil = 0;
      break;
    case 'earth':
      s.rattledUntil = 0;
      break;
    case 'shadow':
      s.hexUntil = 0;
      break;
    case 'nature':
      s.poisonStacks = 0;
      s.poisonUntil = 0;
      break;
  }
}

/**
 * A reaction's effect on `m` (its mark already used up). Returns the hit's
 * amount after it: the damage multipliers, times Catalyst.
 */
function react(ctx: SimCtx, m: MonsterEntity, id: ReactionId, amount: number): number {
  const r = ctx.bal.reactions;
  const h = ctx.world.hero;
  const catalyst = 1 + (h.stats.legendaries.catalyst ?? 0) / 100;
  switch (id) {
    case 'melt':
      return amount * r.meltMult * catalyst;
    case 'shatter':
      return amount * r.shatterMult * catalyst;
    case 'overload': {
      const blast = amount * r.overloadMult * catalyst;
      ctx.events.push({
        kind: 'explode',
        x: m.x,
        y: m.y,
        radius: r.overloadRadius,
        element: 'storm',
        infusion: null,
      });
      for (const o of nearby(ctx, m, r.overloadRadius))
        hitMonster(ctx, o, blast, 'storm', { source: 'reaction', noReact: true });
      return amount;
    }
    case 'superconduct':
      freeze(ctx, m, r.superconductFreeze);
      return amount;
    case 'soulfire':
      return amount * catalyst;
    case 'combust': {
      const hit = amount * r.combustMult * catalyst;
      ctx.events.push({
        kind: 'explode',
        x: m.x,
        y: m.y,
        radius: r.combustRadius,
        element: 'nature',
        infusion: null,
      });
      for (const o of nearby(ctx, m, r.combustRadius))
        hitMonster(ctx, o, hit, 'fire', { source: 'reaction', noReact: true });
      return hit;
    }
    case 'blight':
      spreadAffliction(ctx, m);
      return amount;
    default:
      // The new eight's effects arrive in their own tasks.
      return amount;
  }
}
```

- In `hitMonster`, replace the whole reaction block, from `  // Elemental reactions: the element of this hit meets a status already on the foe.` through its closing `  }` (the one after `    if (reaction === 'soulfire') healHero(ctx, amount * r.soulfireHeal, 'soulfire');`), with:

```ts
  // Elemental reactions: this hit's element meets another element's mark on the foe.
  let reaction: ReactionId | undefined;
  const found = element && !opts.noReact ? findReaction(ctx, m, element) : null;
  if (found) {
    reaction = found.def.id;
    if (found.def.consumes !== false) useUpMark(m, found.mark, reaction);
    amount = react(ctx, m, reaction, amount);
    noteReaction(ctx, reaction, m);
    if (reaction === 'soulfire') healHero(ctx, amount * bal.reactions.soulfireHeal, 'soulfire');
  }
```

(The mark is cleared before the effect runs; Soulfire and Blight clear nothing. Overload's and Combust's blasts measure as before; `spreadAffliction` is Plague's spread, which is Blight's now: poison and hex, each only if the foe has it.)

- [ ] **Step 4: The seven's texts**

In `src/data/arpg.json`, the seven entries' `text`s become (everything else on each line stays):

| id | text |
|---|---|
| `melt` | `Fire and Frost meet: the hit deals double damage.` |
| `shatter` | `Earth and Frost meet: Earth shatters a frozen foe, or Frost a rattled one, for massive bonus damage.` |
| `overload` | `Fire and Storm meet: the foe explodes, hitting everything nearby.` |
| `superconduct` | `Frost and Storm meet: the foe freezes solid.` |
| `soulfire` | `Fire and Shadow meet: part of the damage heals you.` |
| `combust` | `Fire and Nature meet: the hit detonates, blasting everything around the foe.` |
| `blight` | `Shadow and Nature meet: the foe's poison and hex spread to its neighbours.` |

- [ ] **Step 5: Run to verify they pass, and the reaction suites**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts tests/ability-status.test.ts tests/arpg-sim.test.ts tests/delve-pair.test.ts tests/delve-infusion.test.ts && npx tsc --noEmit -p .)`
Expected: all PASS but one, in `delve-infusion.test.ts`: "a tick impact's explode (an ember) carries null; the same impact landing carries it" now sees `[ null, 'storm', null ]`. That is this feature working: the Fire + Storm ability's tick shocked the foe (and burned it), so its landing's Fire meets the Storm mark: Overload, whose blast carries no infusion.

In `tests/delve-infusion.test.ts`, in that test, `    expect(only(events, 'explode').map((e) => e.infusion)).toEqual([null, 'storm']);` becomes

```ts
    // The landing's Fire meets the Storm the tick left: Overload, whose blast carries null.
    expect(only(events, 'explode').map((e) => e.infusion)).toEqual([null, 'storm', null]);
```

Rerun the command above. Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/arpg/combat.ts packages/engine/tests/delve-infusion.test.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/arpg/combat.ts packages/engine/src/data/arpg.json packages/engine/tests/delve-infusion.test.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): reactions fire both ways, looked up from the foe's marks in order" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 3: Engine: the new eight

Each new reaction's task adds its entry to `EFFECTS` (so the both-ways table checks it from either side, that it uses up the mark and what it does) plus its own tests, then its `case` in `react`. Until Task 9 the ids without a case still fall to `default` (a plain hit that uses up the mark).

### Task 5: Obsidian, and the buff reactions' own cooldown

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`HeroEntity.barrier`, `reactionReadyAt`; the `barrierBreak` event)
- Modify: `packages/engine/src/arpg/world.ts` (`createHeroEntity`)
- Modify: `packages/engine/src/arpg/combat.ts` (`findReaction`'s cooldown, `react`'s Obsidian, `hitMonster` starts the cooldown)
- Modify: `packages/engine/src/arpg/abilities/defend.ts` (`shieldHero`)
- Modify: `packages/engine/src/arpg/step.ts` (`heroTick`: the barrier lapses)
- Test: `packages/engine/tests/delve-reactions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-reactions.test.ts`:
- in the `../src/arpg/combat.js` import, add `  hurtHero,` after `  hitMonster,`;
- in `EFFECTS`, after the `blight` entry, add

  ```ts
    obsidian: (f) => {
      const h = f.w.hero;
      const r = bal.reactions;
      const hp = Math.min(f.dealt * r.obsidianSoak, h.stats.maxHp * r.obsidianCap);
      expect(h.barrier).toEqual({
        hp: expect.closeTo(hp, 6),
        max: expect.closeTo(hp, 6),
        until: f.w.t + r.obsidianDuration,
      });
    },
  ```

- in the both-ways `it.each`, between `    } else expect(hasMark(ctx, m, marked)).toBe(false);` and `    EFFECTS[id]!(f);` add

  ```ts
      // A buff reaction starts its own cooldown.
      if (registry.getReaction(id).cooldown)
        expect(f.w.hero.reactionReadyAt[id]).toBeCloseTo(f.w.t + bal.reactions.reactionCooldown);
  ```

- before `describe('saves remember every reaction', () => {` add

```ts
describe('Obsidian', () => {
  const r = bal.reactions;

  it("soaks after Armor's reduction and retaliation, and before the Ward", () => {
    const armor = setup([dummy(13, 35)], { defensive: { form: 'armor', elements: ['fire'] } });
    const h = armor.w.hero;
    h.defend = { form: 'armor', until: 1e9 };
    h.barrier = { hp: 10, max: 10, until: 1e9 };
    const cut = Math.min(0.75, h.abilities[1].effect);
    expect(shieldHero(armor.ctx, 100, armor.m, true)).toBeCloseTo(100 * (1 - cut) - 10);
    expect(armor.m.hp).toBeLessThan(armor.m.maxHp); // Armor struck back

    const ward = setup(); // the fixture's Defensive is a Ward
    ward.w.hero.defend = { form: 'ward', until: 1e9 };
    ward.w.hero.ward = { hp: 50, max: 50 };
    ward.w.hero.barrier = { hp: 30, max: 30, until: 1e9 };
    expect(shieldHero(ward.ctx, 100, null, false)).toBeCloseTo(20);
    const breaks = ward.events.filter((e) => e.kind === 'barrierBreak' || e.kind === 'wardBreak');
    expect(breaks.map((e) => e.kind)).toEqual(['barrierBreak', 'wardBreak']);
  });

  it('soaks with no Defensive up, unavoidable damage too, and under Invulnerable', () => {
    const { w, ctx } = setup();
    const h = w.hero;
    h.barrier = { hp: 30, max: 30, until: 1e9 };
    expect(shieldHero(ctx, 20, null, false)).toBe(0);
    const hp = h.hp;
    hurtHero(ctx, 5, null, null, { unavoidable: true });
    expect(h.barrier!.hp).toBe(5);
    expect(h.hp).toBe(hp);
    // Invulnerable (Training Grounds): a blocked hit still drains it, as it does the Ward.
    w.sandbox = { infiniteMana: false, noCooldowns: false, invulnerable: true };
    hurtHero(ctx, 3, null, null);
    expect(h.barrier!.hp).toBeLessThan(5);
    expect(h.hp).toBe(hp);
  });

  it('keeps the larger barrier (a smaller one only extends it), and caps it', () => {
    const { w, ctx, m } = setup();
    const h = w.hero;
    const cap = h.stats.maxHp * r.obsidianCap;
    const obsidian = (base: number) => {
      applyStatus(ctx, m, 'stagger', 0, true);
      hitMonster(ctx, m, base, 'fire', { source: 'skill' });
    };
    obsidian(1e6);
    expect(h.barrier).toEqual({ hp: cap, max: cap, until: w.t + r.obsidianDuration });
    h.barrier!.hp = cap / 2;
    w.t += r.reactionCooldown;
    obsidian(1);
    expect(h.barrier).toEqual({ hp: cap / 2, max: cap, until: w.t + r.obsidianDuration });
    w.t += r.reactionCooldown;
    obsidian(1e6);
    expect(h.barrier).toEqual({ hp: cap, max: cap, until: w.t + r.obsidianDuration });
  });

  it('breaks with its event, and lapses silently', () => {
    const { w, ctx, events } = setup();
    const h = w.hero;
    h.barrier = { hp: 5, max: 5, until: 1e9 };
    expect(shieldHero(ctx, 8, null, false)).toBe(3);
    expect(h.barrier).toBeNull();
    expect(events).toContainEqual({ kind: 'barrierBreak', x: h.x, y: h.y });
    h.barrier = { hp: 5, max: 5, until: w.t + 0.2 };
    const later = run(w, 0.3);
    expect(h.barrier).toBeNull();
    expect(later.some((e) => e.kind === 'barrierBreak')).toBe(false);
  });
});

describe('buff reactions', () => {
  it('on its own cooldown, a buff reaction is skipped: a plain hit keeps the mark, or the next mark reacts', () => {
    const { w, ctx, m, events } = setup();
    w.sandbox = { infiniteMana: false, noCooldowns: true, invulnerable: false }; // abilities only
    applyStatus(ctx, m, 'stagger', 0, true);
    w.hero.reactionReadyAt.obsidian = w.t + 1;
    hitMonster(ctx, m, 10, 'fire', { source: 'skill' });
    expect(reactions(events)).toEqual([]);
    expect(isRattled(ctx, m)).toBe(true);
    applyStatus(ctx, m, 'hex', 0);
    hitMonster(ctx, m, 10, 'fire', { source: 'skill' });
    expect(reactions(events)).toEqual(['soulfire']);
  });
});

```

(The fixture hero's max life is 154, so the cap is 46.2: a 1e6 hit caps it, a hit of 1 doesn't. Under Invulnerable, the plain hit of 3 is cut by the hero's armor before the barrier takes it, so the test only asks that the barrier drained and no life went. The buff test runs with the Training Grounds' No cooldowns on: it covers abilities, not reactions.)

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts)`
Expected: 7 FAIL: both Obsidian table cases ("Cannot read properties of undefined (reading 'obsidian')": no `reactionReadyAt` yet), the four Obsidian tests ("expected 65 to be close to 55", "expected 20 to be +0", the barrier `undefined`, "expected 8 to be 3") and the buff cooldown test.

- [ ] **Step 3: The types and the hero's start**

`src/types/arpg.ts`:
- in `HeroEntity`, after `  ward: { hp: number; max: number } | null;` add

  ```ts
    /** Obsidian's barrier: soaks damage after the Defensive and before the Ward, until `until`. */
    barrier: { hp: number; max: number; until: number } | null;
    /** When each buff reaction can fire again (missing: ready). */
    reactionReadyAt: Partial<Record<ReactionId, number>>;
  ```

- in `ArpgEvent`, after `  | { kind: 'wardBreak'; x: number; y: number; element: ManaType }` add `  | { kind: 'barrierBreak'; x: number; y: number }`.

`src/arpg/world.ts`, `createHeroEntity`: after `    ward: null,` add

```ts
    barrier: null,
    reactionReadyAt: {},
```

- [ ] **Step 4: The cooldown, and Obsidian's barrier**

`src/arpg/combat.ts`:
- in `findReaction`, `    return { def: ctx.registry.getReactionFor(element, mark), mark };` becomes

  ```ts
      const def = ctx.registry.getReactionFor(element, mark);
      // A buff reaction on its own cooldown can't fire.
      if (!def.cooldown || ctx.world.t >= (ctx.world.hero.reactionReadyAt[def.id] ?? 0))
        return { def, mark };
  ```

- in `react`, after `  const h = ctx.world.hero;` add `  const t = ctx.world.t;`, and before `    default:` add

  ```ts
      case 'obsidian': {
        // The larger barrier wins; a smaller one only extends it.
        const hp = Math.min(amount * r.obsidianSoak, h.stats.maxHp * r.obsidianCap);
        if (!h.barrier || hp > h.barrier.hp)
          h.barrier = { hp, max: hp, until: t + r.obsidianDuration };
        else h.barrier.until = t + r.obsidianDuration;
        return amount;
      }
  ```

- in `hitMonster`, after `    amount = react(ctx, m, reaction, amount);` add

  ```ts
      if (found.def.cooldown) h.reactionReadyAt[reaction] = world.t + bal.reactions.reactionCooldown;
  ```

(Catalyst doesn't touch Obsidian: the barrier is half the hit before any multiplier, and the buff reactions have none.)

- [ ] **Step 5: `shieldHero` soaks with the barrier**

`src/arpg/abilities/defend.ts`: replace `shieldHero`, from its doc comment ("Damage the hero takes after the Defensive: …") down to (not including) its Ward block `  if (form === 'ward' && h.ward) {`, with:

```ts
/**
 * Damage the hero takes after its guards: Armor and Earth reduce it, melee
 * attackers catch the element (Armor strikes back), then Obsidian's barrier
 * (with or without a Defensive) and the Ward soak it up.
 */
export function shieldHero(
  ctx: SimCtx,
  dmg: number,
  source: MonsterEntity | null,
  melee: boolean,
): number {
  const h = ctx.world.hero;
  const ab = defendingAbility(ctx);
  const form = ab ? h.defend!.form : null;
  if (ab) {
    if (form === 'armor') dmg *= 1 - Math.min(0.75, ab.effect);
    if (ab.elements.includes('earth')) dmg *= 1 - ctx.bal.abilities.defend.earthReduction;

    if (melee && source && !source.dead) {
      const rattles = ab.elements.includes('earth');
      if (form === 'armor') {
        hitMonster(ctx, source, abilityHit(ctx, ab), ab.element, {
          source: 'skill',
          applies: ab.knobs.applies,
          leech: ab.knobs.lifesteal,
          slot: DEFENSIVE,
          rattles,
        });
      } else {
        for (const s of ab.knobs.applies)
          if (!source.dead) applyStatus(ctx, source, s, abilityHit(ctx, ab) * 0.5, rattles);
      }
    }
  }

  if (h.barrier) {
    const soaked = Math.min(h.barrier.hp, dmg);
    h.barrier.hp -= soaked;
    dmg -= soaked;
    if (h.barrier.hp <= 1e-6) {
      h.barrier = null;
      ctx.events.push({ kind: 'barrierBreak', x: h.x, y: h.y });
    }
  }

```

The Ward block and `return dmg;` after it stay as they are (`form` is now null without a Defensive, so the Ward block is skipped then). `hurtHero` calls `shieldHero` for unavoidable damage and before it checks Invulnerable, so the barrier soaks both, and drains in the Training Grounds as the Ward does.

`src/arpg/step.ts`, `heroTick`: just above `  if (world.queuedPotion) {` (after `  const move = input.move;` and its blank line) add these two lines and a blank line after them:

```ts
  // Obsidian's barrier lapses without breaking.
  if (h.barrier && world.t >= h.barrier.until) h.barrier = null;

```

- [ ] **Step 6: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts tests/delve-training.test.ts tests/ability-cast.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/abilities/defend.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/abilities/defend.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): Obsidian's barrier, and a cooldown for the buff reactions" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Lightning Rod

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`HeroEntity.quickUntil`)
- Modify: `packages/engine/src/arpg/world.ts` (`createHeroEntity`)
- Modify: `packages/engine/src/arpg/dodge.ts` (`refundDodgeCharge`; `notePerfect` uses it)
- Modify: `packages/engine/src/arpg/combat.ts` (import; `react`)
- Modify: `packages/engine/src/arpg/step.ts` (`heroTick`'s pace)
- Test: `packages/engine/tests/delve-reactions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-reactions.test.ts`:
- after `import { shieldHero } from '../src/arpg/abilities/defend.js';` add `import { refundDodgeCharge } from '../src/arpg/dodge.js';`;
- in `EFFECTS`, after the `obsidian` entry, add

  ```ts
    lightning_rod: (f) => {
      expect(f.w.hero.dodgeCharges).toBe(1);
      expect(f.w.hero.quickUntil).toBe(f.w.t + bal.reactions.lightningRodDuration);
    },
  ```

- before `describe('buff reactions', () => {` add

```ts
describe('Lightning Rod', () => {
  it('gives back a dodge charge as a perfect dodge does', () => {
    const { w, ctx } = setup();
    const h = w.hero;
    h.dodgeCharges = 0;
    h.dodgeRechargeAt = w.t + 1;
    refundDodgeCharge(ctx);
    expect(h).toMatchObject({ dodgeCharges: 1, dodgeRechargeAt: w.t + 1 });
    refundDodgeCharge(ctx);
    expect(h).toMatchObject({ dodgeCharges: bal.dodge.charges, dodgeRechargeAt: 0 });
    refundDodgeCharge(ctx);
    expect(h.dodgeCharges).toBe(bal.dodge.charges);
  });

  it('quickens movement while it lasts', () => {
    const walk = (quick: boolean) => {
      const { w } = setup([]);
      if (quick) w.hero.quickUntil = 1e9;
      const x0 = w.hero.x;
      run(w, 0.5, { x: 1, y: 0 });
      return w.hero.x - x0;
    };
    expect(walk(true) / walk(false)).toBeCloseTo(1 + bal.reactions.lightningRodMove);
  });
});

```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts)`
Expected: 4 FAIL: both Lightning Rod table cases ("expected +0 to be 1"), `refundDodgeCharge` "is not a function", and the walk ("expected 1 to be close to 1.3").

- [ ] **Step 3: Implement**

`src/types/arpg.ts`, `HeroEntity`: after the `barrier` member add

```ts
  /** Lightning Rod quickens movement until this time. */
  quickUntil: number;
```

`src/arpg/world.ts`, `createHeroEntity`: after `    barrier: null,` add `    quickUntil: 0,`.

`src/arpg/dodge.ts`: replace `notePerfect`'s doc and body down to its riposte line, so that the file's end reads:

```ts
/** One dodge charge back (a perfect dodge, Lightning Rod); full charges stop the recharge. */
export function refundDodgeCharge(ctx: SimCtx): void {
  const h = ctx.world.hero;
  const max = ctx.bal.dodge.charges;
  h.dodgeCharges = Math.min(max, h.dodgeCharges + 1);
  if (h.dodgeCharges >= max) h.dodgeRechargeAt = 0;
}

/** An attack would have landed early in the dodge: a perfect dodge (once per dodge). */
export function notePerfect(ctx: SimCtx): void {
  if (!perfectOrigin(ctx)) return;
  const { world, bal } = ctx;
  const h = world.hero;
  h.dodge!.perfect = true;
  // Chained perfects while the riposte is armed don't refund, so dodges aren't free in a crowd.
  if (world.t >= h.riposteUntil) refundDodgeCharge(ctx);
  h.riposteUntil = world.t + bal.dodge.riposteWindow;
  ctx.events.push({ kind: 'perfectDodge', x: h.x, y: h.y });
}
```

(That is: the two lines `  if (world.t >= h.riposteUntil) h.dodgeCharges = Math.min(bal.dodge.charges, h.dodgeCharges + 1);` and `  if (h.dodgeCharges >= bal.dodge.charges) h.dodgeRechargeAt = 0;` become the one `refundDodgeCharge` call. With the riposte armed the old code still cleared `dodgeRechargeAt` when full, but full charges already mean `dodgeRechargeAt === 0` (`dodgeTick` and `tryDodge` keep that so), so nothing changes.)

`src/arpg/combat.ts`:
- `import { notePerfect } from './dodge.js';` becomes `import { notePerfect, refundDodgeCharge } from './dodge.js';`;
- in `react`, before `    default:` add

  ```ts
      case 'lightning_rod':
        refundDodgeCharge(ctx);
        h.quickUntil = t + r.lightningRodDuration;
        return amount;
  ```

`src/arpg/step.ts`, `heroTick`: `    const pace = h.stats.moveSpeed * (surge ? 1 + bal.abilities.defend.surgeMove : 1) * slow;` becomes

```ts
    // Lightning Rod quickens the step, on top of Surge and any recovery.
    const quick = t < h.quickUntil ? 1 + bal.reactions.lightningRodMove : 1;
    const pace =
      h.stats.moveSpeed * (surge ? 1 + bal.abilities.defend.surgeMove : 1) * quick * slow;
```

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts tests/delve-dodge.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): Lightning Rod gives back a dodge and quickens the step" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Sunder

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`StatusState.sunderUntil`)
- Modify: `packages/engine/src/arpg/world.ts` (`emptyStatus`)
- Modify: `packages/engine/src/arpg/combat.ts` (`isSundered`; `hitMonster`'s multiplier; `react`)
- Test: `packages/engine/tests/delve-reactions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-reactions.test.ts`:
- in the `../src/arpg/combat.js` import, add `  isSundered,` after `  isShocked,`;
- in `EFFECTS`, after the `lightning_rod` entry, add

  ```ts
    sunder: (f) => expect(f.m.status.sunderUntil).toBe(f.w.t + bal.reactions.sunderDuration),
  ```

- before `describe('buff reactions', () => {` add

```ts
describe('Sunder', () => {
  it('boosts every later hit on the foe, but not the hit that sunders', () => {
    const plain = setup();
    const fireHit = hitMonster(plain.ctx, plain.m, 100, 'fire', { source: 'skill' });
    const { w, ctx, m } = setup();
    applyStatus(ctx, m, 'hex', 0);
    // The sundering hit gets the hex it used up, not Sunder.
    expect(hitMonster(ctx, m, 100, 'earth', { source: 'skill' })).toBeCloseTo(
      hitMonster(plain.ctx, plain.m, 100, 'earth', { source: 'skill' }) * (1 + bal.status.hexBonus),
    );
    expect(isSundered(ctx, m)).toBe(true);
    expect(hitMonster(ctx, m, 100, 'fire', { source: 'skill' })).toBeCloseTo(
      fireHit * (1 + bal.reactions.sunderBonus),
    );
    w.t += bal.reactions.sunderDuration;
    expect(isSundered(ctx, m)).toBe(false);
  });
});

```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts)`
Expected: 3 FAIL: both Sunder table cases ("expected undefined to be 4") and `isSundered` "is not a function".

- [ ] **Step 3: Implement**

`src/types/arpg.ts`, `StatusState`: after the `rattledUntil` member add

```ts
  /** Sunder: every hit on the foe deals more until this time. */
  sunderUntil: number;
```

`src/arpg/world.ts`, `emptyStatus()`: after `    rattledUntil: 0,` add `    sunderUntil: 0,`.

`src/arpg/combat.ts`:
- after `isRattled` add

  ```ts
  export function isSundered(ctx: SimCtx, m: MonsterEntity): boolean {
    return ctx.world.t < m.status.sunderUntil;
  }
  ```

- in `hitMonster`, after `  if (isHexed(ctx, m)) amount *= 1 + bal.status.hexBonus;` add `  if (isSundered(ctx, m)) amount *= 1 + bal.reactions.sunderBonus;` (before the reaction step, so the hit that sunders isn't boosted);
- in `react`, before `    default:` add

  ```ts
      case 'sunder':
        // Later hits only: this one's multipliers are already in.
        m.status.sunderUntil = t + r.sunderDuration;
        return amount;
  ```

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): Sunder makes a foe take more from every later hit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Seedling and Siphon

Both leave drops: Seedling a health orb (`mana: 'nature'`, so the client can draw it as a sprout), Siphon three shadow motes that fly to the hero from anywhere (`spawnDrop`'s new `vacuum`). They appear in the Training Grounds too: they are the reaction, not loot.

**Files:**
- Modify: `packages/engine/src/arpg/combat.ts` (`spawnDrop`'s `vacuum`; `react`)
- Test: `packages/engine/tests/delve-reactions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-reactions.test.ts`:
- after `import { resolveAbility } from '../src/arpg/abilities/resolve.js';` add `import { createSandboxWorld, spawnDummies } from '../src/arpg/sandbox.js';`, and before `import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';` add `import { computeHeroStats } from '../src/delve/hero-stats.js';`;
- in the `./fixtures/arena.js` import, add `  DEFAULT_BUILDS,` before `  arena,`;
- in `EFFECTS`, after the `sunder` entry, add

```ts
  seedling: (f) =>
    expect(f.w.drops).toEqual([
      expect.objectContaining({
        kind: 'orb',
        mana: 'nature',
        amount: bal.reactions.seedlingHeal,
        x: f.m.x,
        y: f.m.y,
        vacuum: false,
      }),
    ]),
  siphon: (f) => {
    expect(f.w.drops).toHaveLength(3);
    for (const d of f.w.drops) {
      expect(d).toMatchObject({ kind: 'mote', mana: 'shadow', vacuum: true });
      expect(d.amount).toBeCloseTo((bal.reactions.siphonMana * f.w.hero.manaMax) / 3);
      expect(Math.hypot(d.x - f.m.x, d.y - f.m.y)).toBeCloseTo(0.4);
    }
  },
```

and before `describe('buff reactions', () => {` add

```ts
describe('Seedling and Siphon', () => {
  it("Seedling's orb heals when picked up", () => {
    const { w, ctx, m } = setup();
    applyStatus(ctx, m, 'poison', 100);
    hitMonster(ctx, m, 10, 'earth', { source: 'skill' });
    const h = w.hero;
    h.hp = 1;
    [h.x, h.y] = [w.drops[0].x, w.drops[0].y + 1];
    expect(run(w, 0.5).filter((e) => e.kind === 'heal')).toEqual([
      {
        kind: 'heal',
        amount: expect.closeTo(h.stats.maxHp * bal.reactions.seedlingHeal, 6),
        source: 'orb',
      },
    ]);
  });

  it("Siphon's motes fly in from across the arena and restore mana", () => {
    const { w, ctx, m } = setup(); // the hero stands 16 units off
    applyStatus(ctx, m, 'hex', 0);
    hitMonster(ctx, m, 10, 'frost', { source: 'skill' });
    w.hero.mana = 0;
    const pickups = run(w, 2).flatMap((e) => (e.kind === 'pickup' ? [e] : []));
    expect(pickups.map((e) => e.mana)).toEqual(['shadow', 'shadow', 'shadow']);
    const total = pickups.reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBeCloseTo(bal.reactions.siphonMana * w.hero.manaMax);
    expect(w.hero.mana).toBeGreaterThanOrEqual(total);
  });

  it('the Training Grounds get them too: they are the reaction, not loot', () => {
    const w = createSandboxWorld(registry, {
      depth: 3,
      stats: computeHeroStats({}, registry),
      abilities: DEFAULT_BUILDS,
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    const ctx = makeCtx(registry, w, []);
    applyStatus(ctx, d, 'poison', 100);
    hitMonster(ctx, d, 10, 'earth', { source: 'skill' }); // Seedling
    applyStatus(ctx, d, 'hex', 0);
    hitMonster(ctx, d, 10, 'frost', { source: 'skill' }); // Siphon
    expect(w.drops.map((x) => x.kind)).toEqual(['orb', 'mote', 'mote', 'mote']);
  });
});

```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts)`
Expected: 7 FAIL: the four table cases (no drops: "expected [] to deeply equal [ ObjectContaining{…} ]", "expected [] to have a length of 3 but got +0"), the orb ("Cannot read properties of undefined (reading 'x')"), the motes ("expected [] to deeply equal [ 'shadow', 'shadow', 'shadow' ]") and the Training Grounds ("expected [] to deeply equal [ 'orb', 'mote', 'mote', 'mote' ]").

- [ ] **Step 3: Implement**

`src/arpg/combat.ts`:
- `spawnDrop`'s parameter `  extra: { item?: GearItem; mana?: ManaType; amount: number },` becomes

  ```ts
    /** `vacuum`: pulled to the hero from anywhere (default: once the floor is cleared). */
    extra: { item?: GearItem; mana?: ManaType; amount: number; vacuum?: boolean },
  ```

  and in its `world.drops.push({ … })`, `    vacuum: world.cleared,` becomes `    vacuum: extra.vacuum ?? world.cleared,`.
- in `react`, before `    default:` add

  ```ts
      case 'seedling':
        spawnDrop(ctx, 'orb', m.x, m.y, { amount: r.seedlingHeal, mana: 'nature' });
        return amount;
      case 'siphon': {
        // Three motes round the foe (fixed, no rng), pulled to the hero wherever it stands.
        const each = (r.siphonMana * h.manaMax) / 3;
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
          const x = m.x + Math.cos(a) * 0.4;
          const y = m.y + Math.sin(a) * 0.4;
          spawnDrop(ctx, 'mote', x, y, { amount: each, mana: 'shadow', vacuum: true });
        }
        return amount;
      }
  ```

(`spawnDrop` doesn't check `world.sandbox`: only `killMonster`'s `dropLoot` does, so the Training Grounds get these drops. A health orb heals `seedlingHeal` × max life on pickup, as `dropsTick` does for any orb; a mote adds its amount to mana.)

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors. Then the whole engine suite (see Conventions).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/arpg/combat.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/arpg/combat.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): Seedling sprouts a healing orb, Siphon tears loose mana motes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Crystallize, Blackout and Galvanize

With these three, `react` handles all fifteen and its `default` goes (so the compiler checks the switch covers every id).

**Files:**
- Modify: `packages/engine/src/arpg/combat.ts` (`react`)
- Test: `packages/engine/tests/delve-reactions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-reactions.test.ts`, in `EFFECTS`, after the `siphon` entry, add

```ts
  crystallize: (f) => {
    expect(f.dealt / f.plain).toBeCloseTo(bal.reactions.crystallizeMult);
    expect(f.o.status.chillStacks).toBe(1);
    expect(isChilled(f.ctx, f.o)).toBe(true);
    expect(f.events).toContainEqual({
      kind: 'explode',
      x: f.m.x,
      y: f.m.y,
      radius: bal.reactions.crystallizeRadius,
      element: 'frost',
      infusion: null,
    });
  },
  blackout: (f) => {
    for (const foe of [f.m, f.o])
      expect(foe.status.blindUntil).toBe(f.w.t + bal.status.blindDuration);
  },
  galvanize: (f) => expect(f.w.hero.cooldowns[0]).toBe(5 - bal.reactions.galvanizeSeconds),
```

(the table's setup put the Primary 5 s into its cooldown); in `describe('every pair reacts, both ways', …)`, before `  it("each reaction's text names both its elements", () => {`, add

```ts
  it('checks all fifteen', () => {
    const ids = registry.getArpgData().reactions.map((r) => r.id);
    expect(Object.keys(EFFECTS).sort()).toEqual(ids.sort());
  });

```

and before `describe('buff reactions', () => {` add

```ts
describe('Galvanize', () => {
  it('a charge slot gains a unit; a slot cooling down loses a second, never past now', () => {
    const { w, ctx, m } = setup();
    const h = w.hero;
    h.cooldowns = [w.t + 0.5, w.t + 5, w.t + 3]; // the Ultimate pays by charge: that's its lockout
    h.charge[2] = h.abilities[2].chargeNeed - 0.5;
    applyStatus(ctx, m, 'shock', 0);
    hitMonster(ctx, m, 10, 'nature', { source: 'skill' });
    expect(h.cooldowns).toEqual([w.t, w.t + 5 - bal.reactions.galvanizeSeconds, w.t + 3]);
    expect(h.charge[2]).toBe(h.abilities[2].chargeNeed);
  });
});

```

(The fixture's Primary and Defensive pay mana and its Ultimate pays charge. The Ultimate's charge lockout, `cooldowns[2]`, is never shortened, as Nightstalker never shortens one; during it the hit banks no charge either (`gainCharge` skips a slot in lockout), so the full meter is Galvanize's unit alone.)

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts)`
Expected: 7 FAIL: the six table cases ("expected 1 to be close to 1.8", "expected +0 to be 4", "expected 5 to be 4") and Galvanize ("expected [ 0.5, 5, 3 ] to deeply equal [ +0, 4, 3 ]"). `checks all fifteen` already passes (it guards the table from now on).

- [ ] **Step 3: Implement**

In `src/arpg/combat.ts`, `react`: replace

```ts
    default:
      // The new eight's effects arrive in their own tasks.
      return amount;
```

with

```ts
    case 'crystallize': {
      const hit = amount * r.crystallizeMult * catalyst;
      ctx.events.push({
        kind: 'explode',
        x: m.x,
        y: m.y,
        radius: r.crystallizeRadius,
        element: 'frost',
        infusion: null,
      });
      for (const o of nearby(ctx, m, r.crystallizeRadius)) applyStatus(ctx, o, 'chill', hit);
      return hit;
    }
    case 'blackout':
      for (const o of [m, ...nearby(ctx, m, r.blackoutRadius)]) applyStatus(ctx, o, 'blind', 0);
      return amount;
    case 'galvanize':
      // Per slot, as Nightstalker does for the Defensive.
      h.abilities.forEach((ab, i) => {
        if (ab.build.payment === 'charge') h.charge[i] = Math.min(ab.chargeNeed, h.charge[i] + 1);
        else if (h.cooldowns[i] > t)
          h.cooldowns[i] = Math.max(t, h.cooldowns[i] - r.galvanizeSeconds);
      });
      return amount;
```

(A chill stack through `applyStatus` can freeze a foe already at `chillToFreeze` − 1. Under the Training Grounds' No cooldowns, abilities set no cooldown, so Galvanize only adds charge, which is full anyway.)

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors (the switch now returns for all fifteen ids). Then the whole engine suite (see Conventions).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/arpg/combat.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/arpg/combat.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): Crystallize, Blackout and Galvanize: every pair has its reaction" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 4: Engine: resets, the autopilot and the pacing gate

### Task 10: Resets and determinism

**Files:**
- Modify: `packages/engine/src/arpg/sandbox.ts` (`respawnHero`; the module doc)
- Test: `packages/engine/tests/delve-reactions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-reactions.test.ts`:
- `import { createSandboxWorld, spawnDummies } from '../src/arpg/sandbox.js';` (from Task 8) becomes

  ```ts
  import { botInput } from '../src/arpg/bot.js';
  import { createSandboxWorld, respawnHero, spawnDummies } from '../src/arpg/sandbox.js';
  import { stepWorld } from '../src/arpg/step.js';
  ```

- in the `./fixtures/arena.js` import, add `  STEP,` after `  DEFAULT_BUILDS,`;
- before `describe('saves remember every reaction', () => {` add

```ts
describe('resets and determinism', () => {
  it("respawnHero clears the barrier, the quick step and the reactions' cooldowns", () => {
    const { w } = setup();
    const h = w.hero;
    h.barrier = { hp: 5, max: 5, until: 1e9 };
    h.quickUntil = 1e9;
    h.reactionReadyAt = { obsidian: 1e9, galvanize: 1e9 };
    respawnHero(registry, w);
    expect(h.barrier).toBeNull();
    expect(h.quickUntil).toBe(0);
    expect(h.reactionReadyAt).toEqual({});
  });

  it('the same seed plays out the same events twice', () => {
    const play = () => {
      const w = arena([dummy(13, 30), dummy(14, 30), dummy(12.5, 31)], {
        primary: { elements: ['storm', 'earth'] },
        defensive: { form: 'armor', elements: ['frost', 'shadow'] },
      });
      const events: ArpgEvent[] = [];
      for (let i = 0; i < 8 / STEP; i++)
        events.push(...stepWorld(registry, w, botInput(registry, w), STEP));
      return events;
    };
    const first = play();
    expect(reactions(first)).toContain('lightning_rod');
    expect(JSON.stringify(play())).toBe(JSON.stringify(first));
  });
});

```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts)`
Expected: 1 FAIL: `respawnHero` ("expected { hp: 5, max: 5, until: 1000000000 } to be null"). Determinism already passes (the bot's Storm + Earth Bolt sets off Lightning Rod; it guards from here on).

- [ ] **Step 3: Implement**

`src/arpg/sandbox.ts`:
- in the module doc, the two lines ` * The Training Grounds: an open arena at any depth for trying builds. Its` and ` * world never clears and drops nothing, training dummies soak hits without` become

  ```ts
   * The Training Grounds: an open arena at any depth for trying builds. Its
   * world never clears and drops nothing (but the orbs and motes reactions
   * make: Seedling, Siphon), training dummies soak hits without
  ```

  (the rest of the comment is unchanged);
- in `respawnHero`, after `  h.ward = null;` add

  ```ts
    h.barrier = null;
    h.quickUntil = 0;
    h.reactionReadyAt = {};
  ```

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-reactions.test.ts tests/delve-training.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors. Then the whole engine suite (see Conventions).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/arpg/sandbox.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/arpg/sandbox.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): a respawn clears the reactions' states; determinism test" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The autopilot binds by attunement again, and can force a pair

Every pair reacts now, so the bot's `REACTION_PAIRS` preference goes (its own `ponytail:` note said so). `AutopilotOptions.secondary` forces a pair from the first dive, for the pair sweep.

**Files:**
- Modify: `packages/engine/src/delve/autopilot.ts` (CRLF, not Prettier-clean: hand-edit)
- Test: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-pair.test.ts`, in `describe('the autopilot and the pair', …)`, replace the test `'prefers a partner that reacts with the primary, even owning less of it'` (all of it) with:

```ts
  it('binds the element it owns most, whichever it is: every pair reacts', () => {
    const p = {
      ...createDelveProfile(registry, 5, { primary: 'fire' }),
      // earth 2 (Obsidian), frost 1 (Melt)
      bag: [item('earth', 'helm'), item('earth', 'gloves'), item('frost', 'boots')],
    };
    const after = betweenDives(registry, p);
    expect(after.pair).toEqual({ primary: 'fire', secondary: 'earth' });
    expect(after.abilities.primary.elements).toEqual(['fire', 'earth']);
  });

  it('binds a given secondary before the first dive, and its fused Primary finds their reaction', () => {
    const { profile } = runAutopilot(registry, {
      seed: 1,
      dives: 1,
      primary: 'storm',
      secondary: 'earth',
    });
    expect([profile.pair.primary, profile.pair.secondary].sort()).toEqual(['earth', 'storm']);
    expect([...profile.abilities.primary.elements].sort()).toEqual(['earth', 'storm']);
    expect(profile.reactionsSeen).toContain('lightning_rod');
  });
```

(Sorted, because an overtake may swap which of the two is primary between dives.)

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: 2 FAIL: "expected { primary: 'fire', secondary: 'frost' } to deeply equal { primary: 'fire', secondary: 'earth' }", and "expected [ 'fire', 'storm' ] to deeply equal [ 'earth', 'storm' ]" (`secondary` is ignored).

- [ ] **Step 3: Implement**

In `src/delve/autopilot.ts` (keep its CRLF endings and existing style; don't format it):
- `AutopilotOptions`: after `  primary?: ManaType;` add

  ```ts
    /** Bind this second element before the first dive (the Primary built from both), forcing the pair. */
    secondary?: ManaType;
  ```

- delete the `REACTION_PAIRS` block and `reacts`: everything from `/** The pairs that form a reaction (melt, shatter, overload, superconduct, combust, blight, soulfire). */` through `reacts`'s closing `}` and the blank line after it;
- `bindBest`'s doc comment becomes

  ```ts
  /**
   * Bind the non-primary element the bot owns the most attunement in (equipped
   * and bagged: each item's base plus its `*Attune` lines; ties in MANA_TYPES
   * order), none while that's all 0: every pair reacts. Then build the Primary
   * from both elements, so it keeps finding their reaction.
   */
  ```

- in `bindBest`, the four lines

  ```ts
      const candidates = MANA_TYPES.filter((m) => m !== primary && owned[m] > 0);
      const reacting = candidates.filter((m) => reacts(primary, m));
      let best: ManaType | null = null;
      for (const m of reacting.length > 0 ? reacting : candidates) if (!best || owned[m] > owned[best]) best = m;
  ```

  become

  ```ts
      let best: ManaType | null = null;
      for (const m of MANA_TYPES) if (m !== primary && owned[m] > (best ? owned[best] : 0)) best = m;
  ```

- in `runAutopilot`, after `  let p = opts.profile ?? createDelveProfile(registry, opts.seed, { primary: opts.primary ?? 'fire' });` add

  ```ts
    if (opts.secondary) p = bindBest(registry, bindSecondary(p, opts.secondary).profile);
  ```

  (`bindSecondary` refuses a profile that already has one; `bindBest` then builds the Primary from whatever pair it has.)

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors (`'starts from the primary it is given'` still passes: no overtake can happen before a secondary is bound). Then the whole engine suite (see Conventions).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-pair.test.ts
git add packages/engine/src/delve/autopilot.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): the autopilot binds by attunement again, and can force a pair" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The pacing gate: each run's own reaction, and the 15-pair sweep

**Files:**
- Modify: `packages/engine/tests/delve-pacing.test.ts` (CRLF, not Prettier-clean: hand-edit)
- Modify (only if tuning is needed): `packages/engine/src/data/balance.json` (`delve.reactions`), `packages/engine/tests/delve-reactions.test.ts` (Task 2's numbers), `docs/superpowers/specs/2026-09-28-delve-pair-reactions-design.md` (its starting values)
- Create (scratch, never committed): `packages/engine/tests/scratch-pacing.test.ts`

- [ ] **Step 1: The rail and the sweep**

In `tests/delve-pacing.test.ts` (keep its CRLF endings and style; don't format it):
- replace the runs, from `const runs: AutopilotDiveReport[][] = SEEDS.map(…` through the end of the `frostRuns` declaration (its closing `);`), with:

```ts
const fireResults = SEEDS.map((seed) => runAutopilot(registry, { seed, dives: DIVES }));
const runs: AutopilotDiveReport[][] = fireResults.map((r) => r.reports);
/** A Frost hero (the starter gear re-attuned to frost) must still get deeper dive over dive. */
const FROST_SEEDS = [1, 2];
const frostResults = FROST_SEEDS.map((seed) => runAutopilot(registry, { seed, dives: DIVES, primary: 'frost' }));
const frostRuns: AutopilotDiveReport[][] = frostResults.map((r) => r.reports);

/**
 * Every pair forced from the start (one seed each): a fused Primary sets off
 * its own reaction on every hit after the first, so none may run away or stall.
 */
const SWEEP_DIVES = 6;
const sweep = registry.getArpgData().reactions.map(({ elements: [primary, secondary] }) => ({
  pair: `${primary}+${secondary}`,
  depth: runAutopilot(registry, { seed: 1, dives: SWEEP_DIVES, primary, secondary }).reports[SWEEP_DIVES - 1].endDepth,
}));
```

- replace the test `'mana combos happen naturally: every run, Fire and Frost, finds a reaction by dive 12'` (with its "at most one reaction" comment) with:

```ts
  it("mana combos happen naturally: every run, Fire and Frost, discovers its own pair's reaction by dive 12", () => {
    for (const { profile } of [...fireResults, ...frostResults]) {
      const { primary, secondary } = profile.pair;
      expect(secondary).not.toBeNull();
      expect(profile.reactionsSeen).toContain(registry.getReactionFor(primary!, secondary!).id);
    }
  });

  it('no pair runs away or stalls: each forced pair reaches 0.6–1.6 × the median depth by dive 6', () => {
    const depths = sweep.map((s) => s.depth).sort((a, b) => a - b);
    const median = depths[Math.floor(depths.length / 2)];
    for (const s of sweep) {
      expect(s.depth, s.pair).toBeGreaterThanOrEqual(0.6 * median);
      expect(s.depth, s.pair).toBeLessThanOrEqual(1.6 * median);
    }
  });
```

(Every pair uses seed 1, so the sweep's pairs differ only by their pair.)

- [ ] **Step 2: Run the gate**

Run: `(cd packages/engine && npx vitest run tests/delve-pacing.test.ts)`
(It takes about 15 s now: the runs happen at collect time.)
Expected: 7 PASS. On the scratch copy it passed untuned: the sweep's dive-6 depths were melt 22, shatter 28, overload 34, superconduct 29, soulfire 26, combust 26, blight 28, obsidian 29, lightning_rod 22, sunder 36, seedling 26, siphon 26, crystallize 27, blackout 41, galvanize 28 (median 28, so the band is 16.8–44.8); the Fire runs ended dive 1 at 11, 11, 11, 12 and dive 12 at 33, 41, 41, 36 (pairs fire/frost, fire/storm, shadow/fire, fire/nature, each having found its own reaction); the Frost runs 7 → 28 and 8 → 38. If it passes, skip to Step 5.

- [ ] **Step 3: If it fails, look at the curves**

Create `packages/engine/tests/scratch-pacing.test.ts` (scratch: never committed):

```ts
import { it } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot } from '../src/delve/autopilot.js';

/** SCRATCH (pair reactions plan, Task 12): prints the pair sweep and the pacing curves. Never commit. */
const registry = createDefaultRegistry();
const knobs = registry.getDelveBalance().reactions;
// Try a value here first, then copy the winner into balance.json:
// knobs.crystallizeMult = 1.6;
// knobs.reactionCooldown = 2;
void knobs;

it('prints', () => {
  for (const { id, elements } of registry.getArpgData().reactions) {
    const [primary, secondary] = elements;
    const r = runAutopilot(registry, { seed: 1, dives: 6, primary, secondary }).reports;
    console.log(`${id} ${primary}+${secondary}: ${r.map((d) => d.endDepth).join(' ')}`);
  }
  const plan = [
    ['fire', [1, 2, 3, 4]],
    ['frost', [1, 2]],
  ] as const;
  for (const [primary, seeds] of plan)
    for (const seed of seeds) {
      const { reports: r, profile } = runAutopilot(registry, { seed, dives: 12, primary });
      const perFloor = r.map((d) => d.floorSeconds / Math.max(1, d.endDepth - d.startDepth + 1));
      console.log(
        `${primary} ${seed}: ${r.map((d) => d.endDepth).join(' ')}` +
          ` | ${profile.pair.primary}/${profile.pair.secondary} saw ${profile.reactionsSeen.join(',')}` +
          ` | legendaries ${r[11].legendariesOwned}` +
          ` | s/floor ${Math.round(perFloor.reduce((a, b) => a + b, 0) / perFloor.length)}`,
      );
    }
}, 120_000);
```

Run: `(cd packages/engine && npx vitest run tests/scratch-pacing.test.ts)`
It prints each pair's depth per dive, then each run's curve, its pair and the reactions it saw. Read which rail fails and why (the gate's rails: dive 1 ends between depths 4 and 12 on average, each run reaches depth 3; dive 12 is more than 5 deeper than dive 1 and deeper than dive 6; at least 1 legendary and fewer than all 12; every run has seen its own pair's reaction by dive 12; 8–60 s per floor; Frost: dive 12 at least 5 deeper than dive 1; every forced pair within 0.6–1.6 × the median at dive 6).

- [ ] **Step 4: Tune, in this order, one knob at a time**

Uncomment and change one knob in the scratch file, rerun, and stop at the first value that turns every rail green with some margin. Only `balance.json → delve.reactions` may change here. Walk each knob in these steps before moving to the next:
1. **The pair's damage multiplier**, if the runaway or stalling pair's reaction has one (`meltMult` 2, `shatterMult` 2.5, `overloadMult` 1.2, `combustMult` 1.6, `crystallizeMult` 1.8): 0.2 at a time, down for a pair above 1.6 × the median, up for one below 0.6 ×; never below 1.2, never more than 0.6 from its starting value.
2. **`reactionCooldown`** (1.5), if a buff pair (Obsidian, Lightning Rod, Seedling, Siphon, Galvanize) runs away: 1.5 → 2 → 2.5; if one stalls: 1.5 → 1.
3. **The new eight's amounts**, for the pair at fault: `obsidianSoak` 0.5 → 0.4 → 0.3; `lightningRodMove` 0.3 → 0.2; `sunderBonus` 0.25 → 0.2 → 0.15; `seedlingHeal` 0.08 → 0.06; `siphonMana` 0.15 → 0.1; `blackoutRadius` 2.5 → 2; `galvanizeSeconds` 1 → 0.75 → 0.5 (the reverse steps if the pair stalls).

A red "discovers its own pair's reaction" rail is not a knob problem: check that the run's pair is bound (the bot binds after dive 1 once it owns another element) and that Task 11's `bindBest` builds its Primary from both elements. **Stop rule:** if none of the three steps turns the gate green, or a fix would need anything outside `delve.reactions` (monster numbers, `delve.pair`, the forms), stop and report the scratch output to the user before touching anything else.

Copy the winning value into `src/data/balance.json` (by hand, keeping the layout). If a new reaction's number changed, update Task 2's expected numbers in `tests/delve-reactions.test.ts` and the spec's starting values to match.

- [ ] **Step 5: Delete the scratch file, then run the whole engine**

Delete `tests/scratch-pacing.test.ts` first (it matches the test glob). Then run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: all green, the pacing gate included. `git status` shows no scratch file.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add packages/engine/tests/delve-pacing.test.ts
git commit -m "test(engine): each run finds its own pair's reaction, and all 15 pairs pace alike" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(If you tuned, also stage `packages/engine/src/data/balance.json`, `packages/engine/tests/delve-reactions.test.ts` and the spec, and say what changed in the commit body, e.g. `fix(engine): tune crystallizeMult to 1.6 for the pair sweep`.)

---

## Chunk 5: Client: what the reactions look like

Everything here is cosmetic and follows the mana-pixel rules (`arena/fx/`). The air layer (`PixelLayer(…, true)`) blends additively, so dark colours only show on the ground layer: that is why Blackout's cloud uses the shadow motif (its dark smoke goes on the ground) and the marks drawn in the air are light.

### Task 13: Rebuild the engine; the colours, a label from data, and the Anvil's fifteen

**Files:**
- Modify: `packages/client/src/features/delve/arena/palette.ts` (`REACTION_HEX`)
- Create: `packages/client/src/features/delve/arena/fx/reactions.ts`
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts` (`REACTION_LABEL` goes)
- Create: `packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts`
- Modify: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`

- [ ] **Step 1: Rebuild the engine and see what breaks**

Run: `(cd packages/engine && pnpm build) && (cd packages/client && npx tsc --noEmit -p .; npx vitest run src/features/delve)`
Expected: the build succeeds; tsc FAILS once, in `src/features/delve/arena/palette.ts` ("Type '{ melt: number; … }' is missing the following properties from type 'Record<ReactionId, number>': obsidian, lightning_rod, sunder, seedling, and 4 more."); one test FAILS: `AbilitiesPanel.test.tsx` "edits the builds it is given through onChange, and names the reactions it is told about" ("expected [ … ] to have a length of 6 but got 14": the Anvil reads `arpg.json`, so it already lists fifteen).

- [ ] **Step 2: Write the failing tests**

`src/features/delve/__tests__/AbilitiesPanel.test.tsx`: `    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(6);` becomes

```tsx
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(14);
    expect(screen.getByText('1/15 discovered')).toBeInTheDocument();
```

Create `src/features/delve/arena/fx/__tests__/reactions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reactionLabel } from '../reactions';

describe('reaction labels', () => {
  it('come from the data, so a new reaction never floats "undefined"', () => {
    expect(reactionLabel('melt')).toBe('MELT!');
    expect(reactionLabel('lightning_rod')).toBe('LIGHTNING ROD!');
  });
});
```

- [ ] **Step 3: Run them to verify the label test fails**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/reactions.test.ts src/features/delve/__tests__/AbilitiesPanel.test.tsx)`
Expected: `reactions.test.ts` FAILS ('Failed to resolve import "../reactions"'); `AbilitiesPanel.test.tsx` passes.

- [ ] **Step 4: Implement**

`src/features/delve/arena/palette.ts`, `REACTION_HEX`: after `  blight: 0x8fb34a,` add

```ts
  obsidian: 0xf0a878,
  lightning_rod: 0xfff6a0,
  sunder: 0xc9905a,
  seedling: 0x7ee08a,
  siphon: 0x9fa8ff,
  crystallize: 0xa8fff0,
  blackout: 0x8a7aa8,
  galvanize: 0xd8f56a,
```

Create `src/features/delve/arena/fx/reactions.ts` (Task 14 fills in the rest):

```ts
import type { ReactionId } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';

/** A reaction's floating label: its name from arpg.json, shouted. */
export function reactionLabel(id: ReactionId): string {
  return `${getDelveRegistry().getReaction(id).name.toUpperCase()}!`;
}
```

`src/features/delve/arena/ArenaRenderer.ts`:
- delete the `const REACTION_LABEL: Record<string, string> = { … };` block (nine lines, and the blank line after it);
- after `import { Lifecycles } from './fx/lifecycles';` add `import { reactionLabel } from './fx/reactions';`;
- in `handleEvents`' `case 'hit':`, `              REACTION_LABEL[e.reaction],` becomes `              reactionLabel(e.reaction),`.

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all client tests PASS.

- [ ] **Step 6: Restart the dev server**

The engine was rebuilt: run the dev-server block (header). Expected: `True`.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/palette.ts packages/client/src/features/delve/arena/fx/reactions.ts packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx
git add packages/client/src/features/delve/arena/palette.ts packages/client/src/features/delve/arena/fx/reactions.ts packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx
git commit -m "feat(client): the fifteen reactions' colours, and labels from their data" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The moment a reaction fires, and the barrier breaking

`ArenaRenderer` hands the `reaction` event (at the foe) to `reactionFx`, which draws a signature for each of the eight new reactions and nothing for the seven (they keep the hit's label and ring). `barrierBreak` shatters Obsidian's shell, with `orbRemove` for its sound.

**Files:**
- Modify: `packages/client/src/features/delve/arena/fx/reactions.ts`
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts` (the `reaction` and `barrierBreak` cases)
- Modify: `packages/client/src/features/delve/arena/arena-sounds.ts`
- Test: `packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts`, `packages/client/src/features/delve/__tests__/arena-sounds.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/features/delve/arena/fx/__tests__/reactions.test.ts`: replace its imports with

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ArpgWorld, ReactionId } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { barrierBreakFx, reactionFx, reactionLabel } from '../reactions';
import type { ManaFx } from '../mana-fx';

/** A ManaFx that records which effects were asked for. */
function spyFx() {
  const fx = {
    burst: vi.fn(),
    fling: vi.fn(),
    gather: vi.fn(),
    disperse: vi.fn(),
    ring: vi.fn(),
    bolt: vi.fn(),
    infuse: vi.fn(),
  };
  const calls = () => Object.values(fx).reduce((n, f) => n + f.mock.calls.length, 0);
  return { fx: fx as unknown as ManaFx, spies: fx, calls };
}

const world = { t: 1, hero: { x: 5, y: 8, facing: { x: 0, y: -1 } } } as unknown as ArpgWorld;
```

and append:

```ts
describe('the moment a reaction fires', () => {
  const OLD: ReactionId[] = [
    'melt',
    'shatter',
    'overload',
    'superconduct',
    'soulfire',
    'combust',
    'blight',
  ];
  const all = getDelveRegistry()
    .getArpgData()
    .reactions.map((r) => r.id);

  it('draws a signature for each of the eight new reactions, and nothing for the seven', () => {
    for (const id of all) {
      const { fx, calls } = spyFx();
      reactionFx(fx, { kind: 'reaction', reaction: id, x: 2, y: 3 }, world);
      if (OLD.includes(id)) expect(calls(), id).toBe(0);
      else expect(calls(), id).toBeGreaterThan(0);
    }
    expect(all.filter((id) => !OLD.includes(id))).toHaveLength(8);
  });

  it('Crystallize bursts frost spikes and Blackout a dark cloud, each as wide as the reaction', () => {
    const r = getDelveRegistry().getDelveBalance().reactions;
    const frost = spyFx();
    reactionFx(frost.fx, { kind: 'reaction', reaction: 'crystallize', x: 2, y: 3 }, world);
    expect(frost.spies.infuse).toHaveBeenCalledWith('blast', 'frost', {
      kind: 'ring',
      x: 2,
      y: 3,
      r: r.crystallizeRadius,
    });
    const dark = spyFx();
    reactionFx(dark.fx, { kind: 'reaction', reaction: 'blackout', x: 2, y: 3 }, world);
    expect(dark.spies.infuse).toHaveBeenCalledWith('blast', 'shadow', {
      kind: 'ring',
      x: 2,
      y: 3,
      r: r.blackoutRadius,
    });
  });

  it("Obsidian's shell shatters where the hero stands", () => {
    const { fx, spies } = spyFx();
    barrierBreakFx(fx, { kind: 'barrierBreak', x: 5, y: 8 });
    expect(spies.disperse).toHaveBeenCalled();
    expect(spies.burst.mock.calls[0].slice(0, 2)).toEqual([5, 8 - 0.3]);
  });
});
```

`src/features/delve/__tests__/arena-sounds.test.ts`: before `  it('a hit Invulnerable blocked makes no hurt sound and no buzz', () => {` add

```ts
  it("Obsidian's barrier breaks with a socket's pop", () => {
    playArenaEvents([{ kind: 'barrierBreak', x: 0, y: 0 }]);
    expect(playSound).toHaveBeenCalledWith('orbRemove');
  });

```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/reactions.test.ts src/features/delve/__tests__/arena-sounds.test.ts)`
Expected: 4 FAIL: `reactionFx` / `barrierBreakFx` "is not a function" (3), and the sound ("expected "spy" to be called with arguments: [ 'orbRemove' ]").

- [ ] **Step 3: Implement**

Replace `src/features/delve/arena/fx/reactions.ts` with:

```ts
import type { ArpgEvent, ArpgWorld, ReactionId } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { MANA_HEX } from '../palette';
import type { ManaFx } from './mana-fx';

/**
 * What the reactions look like the moment they fire. The seven older ones
 * keep the hit's label and ring (ArenaRenderer); the eight new ones each draw
 * a signature here, from the `reaction` event (at the foe). Their lasting
 * states (Obsidian's shell, Lightning Rod's trail, the marks) are in
 * draw-world.ts. Cosmetic, so it may use Math.random (ManaFx does).
 */

type Of<K extends ArpgEvent['kind']> = Extract<ArpgEvent, { kind: K }>;

/** Obsidian's colours: embers cooling onto glass (light: the air layer only adds light). */
export const EMBER = 0xff7a3c;
export const OBSIDIAN = 0xdcd0e6;

/** A reaction's floating label: its name from arpg.json, shouted. */
export function reactionLabel(id: ReactionId): string {
  return `${getDelveRegistry().getReaction(id).name.toUpperCase()}!`;
}

/** The moment a reaction fires: a signature for each of the eight new ones, nothing for the seven. */
export function reactionFx(fx: ManaFx, e: Of<'reaction'>, w: ArpgWorld): void {
  const h = w.hero;
  const chest = h.y - 0.3;
  const r = getDelveRegistry().getDelveBalance().reactions;
  switch (e.reaction) {
    case 'obsidian':
      // Embers cool inward onto the hero.
      fx.gather(h.x, chest, EMBER, 18);
      fx.ring(h.x, chest, 1.1, OBSIDIAN, true, 0.4);
      break;
    case 'lightning_rod':
      // A bolt drops into the ground at the hero.
      fx.bolt(
        [
          { x: h.x, y: h.y - 3 },
          { x: h.x, y: h.y + 0.4 },
        ],
        MANA_HEX.storm,
        0.25,
        true,
      );
      fx.burst(h.x, h.y + 0.4, MANA_HEX.earth, 10, 3);
      break;
    case 'sunder':
      // Rock chips burst off the foe.
      fx.burst(e.x, e.y, MANA_HEX.earth, 14, 5, true);
      break;
    case 'seedling':
      fx.burst(e.x, e.y, MANA_HEX.nature, 10, 2);
      fx.ring(e.x, e.y, 0.8, MANA_HEX.nature, true, 0.35);
      break;
    case 'siphon':
      // A violet flash; the motes carry the rest.
      fx.ring(e.x, e.y, 1, MANA_HEX.shadow, true, 0.25);
      break;
    case 'crystallize':
      // Frost spikes burst outward (the frost motif on a growing ring).
      fx.infuse('blast', 'frost', { kind: 'ring', x: e.x, y: e.y, r: r.crystallizeRadius });
      break;
    case 'blackout':
      // A dark cloud: the shadow motif's smoke on the ground, its wisps above.
      fx.infuse('blast', 'shadow', { kind: 'ring', x: e.x, y: e.y, r: r.blackoutRadius });
      break;
    case 'galvanize':
      // Storm sparks at the hero.
      fx.burst(h.x, chest, MANA_HEX.storm, 12, 3);
      break;
    default:
      break;
  }
}

/** Obsidian's shell shatters: its embers scatter and glass flies. */
export function barrierBreakFx(fx: ManaFx, e: Of<'barrierBreak'>): void {
  fx.disperse(e.x, e.y - 0.3, 1.1, EMBER, 24);
  fx.burst(e.x, e.y - 0.3, OBSIDIAN, 14, 5, true);
}
```

(`ManaFx.infuse('blast', …)` gets both layers and the infusion budget, so Crystallize's spikes and Blackout's smoke are drawn by the existing motifs, `SHADOW_SMOKE` on the ground included.)

`src/features/delve/arena/ArenaRenderer.ts`:
- `import { reactionLabel } from './fx/reactions';` becomes `import { barrierBreakFx, reactionFx, reactionLabel } from './fx/reactions';`;
- in `handleEvents`, after the `case 'wardBreak':` block (it ends `this.addShake(0.15);` and `break;`), add

  ```ts
          case 'barrierBreak':
            barrierBreakFx(this.fx, e);
            this.addShake(0.12);
            break;
          case 'reaction':
            reactionFx(this.fx, e, w);
            break;
  ```

`src/features/delve/arena/arena-sounds.ts`: after the `case 'reaction':` block (its `playSound('combineMerge');` and `break;`) add

```ts
      case 'barrierBreak':
        playSound('orbRemove');
        break;
```

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve)`
Expected: no type errors; PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/fx/reactions.ts packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/arena-sounds.ts packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts packages/client/src/features/delve/__tests__/arena-sounds.test.ts
git add packages/client/src/features/delve/arena/fx/reactions.ts packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/arena-sounds.ts packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts packages/client/src/features/delve/__tests__/arena-sounds.test.ts
git commit -m "feat(client): each new reaction's moment, and Obsidian's shell shattering" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The states that last: Obsidian's shell, Lightning Rod's trail, and three marks

**Files:**
- Modify: `packages/client/src/features/delve/arena/fx/draw-world.ts` (`drawGuard`, `drawMonsterMarks`)
- Test: `packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/features/delve/arena/fx/__tests__/reactions.test.ts`:
- after `import { describe, it, expect, vi } from 'vitest';` add `import type { Graphics } from 'pixi.js';`, and after the `../reactions` import add `import { drawGuard, drawMonsterMarks } from '../draw-world';`;
- after the `const world = …;` line add

  ```ts

  /** A Graphics stand-in that counts pixels (`px` draws one rect each). */
  function pixels() {
    const g = { rects: 0, rect: () => (g.rects++, g), fill: () => g };
    return g as unknown as Graphics & { rects: number };
  }
  ```

- append:

```ts
describe('lasting states', () => {
  /** The hero's pixels at t = 1, walking up, with no Defensive and no wind-up. */
  const heroPixels = (over: object) => {
    const hero = {
      x: 5,
      y: 8,
      facing: { x: 0, y: -1 },
      moving: true,
      abilities: [],
      defend: null,
      windup: null,
      barrier: null,
      quickUntil: 0,
      ...over,
    };
    const air = pixels();
    drawGuard(air, { t: 1, hero } as unknown as ArpgWorld, 1);
    return air.rects;
  };

  /** A plain foe's mark pixels at t = 1, both layers. */
  const markPixels = (status: object) => {
    const foe = {
      id: 1,
      x: 5,
      y: 5,
      radius: 0.55,
      kind: 'normal',
      status: {
        rootUntil: 0,
        hexUntil: 0,
        shockUntil: 0,
        freezeUntil: 0,
        poisonUntil: 0,
        poisonStacks: 0,
        staggerUntil: 0,
        brandUntil: 0,
        rattledUntil: 0,
        sunderUntil: 0,
        blindUntil: 0,
        ...status,
      },
    };
    const ground = pixels();
    const air = pixels();
    drawMonsterMarks(ground, air, { t: 1, monsters: [foe] } as unknown as ArpgWorld, 1);
    return ground.rects + air.rects;
  };

  it("Obsidian's shell holds while the barrier does, thinning as it drains", () => {
    expect(heroPixels({})).toBe(0);
    const full = heroPixels({ barrier: { hp: 10, max: 10, until: 9 } });
    const worn = heroPixels({ barrier: { hp: 2, max: 10, until: 9 } });
    expect(worn).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(worn);
  });

  it("Lightning Rod's trail follows the hero while it lasts", () => {
    expect(heroPixels({ quickUntil: 2 })).toBeGreaterThan(0);
    expect(heroPixels({ quickUntil: 0.5 })).toBe(0);
  });

  it('rattled, sundered and blinded foes wear their marks only while they last', () => {
    expect(markPixels({})).toBe(0);
    for (const key of ['rattledUntil', 'sunderUntil', 'blindUntil']) {
      expect(markPixels({ [key]: 2 }), key).toBeGreaterThan(0);
      expect(markPixels({ [key]: 0.5 }), key).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/reactions.test.ts)`
Expected: 3 FAIL ("expected 0 to be greater than 0"; "rattledUntil: expected 0 to be greater than 0").

- [ ] **Step 3: Implement**

In `src/features/delve/arena/fx/draw-world.ts`:
- after `import { windingUp } from './anticipation';` add `import { EMBER } from './reactions';`;
- after `const HOSTILE_EDGE = 0xff9a9a;` add

  ```ts
  /** Blinded foes' smoke: dim, since the air layer only adds light. */
  const BLIND_SMOKE = 0x5d5670;
  /** Sunder's crack, in pixels right of the Hellfire brand. */
  const CRACK = [
    [1, -1],
    [2, 0],
    [1, 1],
    [2, 2],
  ];
  ```

- `drawGuard`'s doc and first lines, `/** Defensive auras around the hero, and a channel's filling arc. */` through `  const cy = h.y - 0.3;`, become

  ```ts
  /**
   * Defensive auras around the hero, the reactions' states on it (Obsidian's
   * shell, Lightning Rod's trail), and a channel's filling arc.
   */
  export function drawGuard(air: Graphics, w: ArpgWorld, time: number): void {
    const h = w.hero;
    const cy = h.y - 0.3;
    if (h.barrier) {
      // Obsidian: a shell of cooling embers that thins as it soaks.
      const k = Math.min(1, Math.max(0, h.barrier.hp / Math.max(1e-6, h.barrier.max)));
      manaRing(air, h.x, cy, 1.15, EMBER, time, {
        alpha: 0.35 + 0.55 * k,
        gaps: Math.round(8 * (1 - k)),
        spin: 1,
        jitter: 1,
      });
      manaDust(air, h.x, cy, 1.1, 0xc0502a, time, 0.01 + 0.05 * k, 0.8, 13);
    }
    if (w.t < h.quickUntil && h.moving) {
      // Lightning Rod: a storm trail behind the quickened hero.
      const len = Math.hypot(h.facing.x, h.facing.y) || 1;
      const bx = -h.facing.x / len;
      const by = -h.facing.y / len;
      const from = { x: h.x + bx * 0.3, y: h.y + 0.2 + by * 0.3 };
      const to = { x: h.x + bx * 1.4, y: h.y + 0.2 + by * 1.4 };
      manaLine(air, from.x, from.y, to.x, to.y, MANA_HEX.storm, 0.8, { every: 2, jitter: 1, time });
    }
  ```

  (the rest of `drawGuard`, from `  const guard = h.abilities[1];`, is unchanged);
- `drawMonsterMarks`' doc `/** Elite and boss rings (ground), and status marks (air): hex, shock, frost, poison, stagger, brand. */` becomes

  ```ts
  /**
   * Elite and boss rings (ground), and status marks (air): hex, shock, frost,
   * poison, stagger, brand, and the reactions' rattle, Sunder and blind.
   */
  ```

- in `drawMonsterMarks`' loop, after `    if (t < s.brandUntil) px(air, m.x - PX, m.y - m.radius - 0.35, MANA_HEX.fire, 1, 2);` add

  ```ts
      if (t < s.rattledUntil) {
        // Earth's mark: rock chips circling low.
        for (let i = 0; i < 3; i++) {
          const a = time * 1.6 + (i * Math.PI * 2) / 3;
          const x = m.x + Math.cos(a) * (m.radius + 0.15);
          px(air, x, m.y + 0.3 + Math.sin(a) * 0.18, MANA_HEX.earth, 0.9, 2);
        }
      }
      if (t < s.sunderUntil)
        for (const [dx, dy] of CRACK)
          px(air, m.x + dx * PX, m.y - m.radius - 0.35 + dy * PX, MANA_HEX.earth, 1);
      if (t < s.blindUntil) {
        // Blind (Blackout, Steam): a dim smoke over the eyes.
        const r = m.radius * 0.7;
        manaDust(air, m.x, m.y - m.radius * 0.6, r, BLIND_SMOKE, time, 0.25, 0.6, m.id + 5);
      }
  ```

(The trail only shows while the hero walks: behind a standing hero it would read as movement. `draw-world.ts` imports `reactions.ts`, which imports only a type from `mana-fx.ts`: no cycle.)

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/arena/fx)`
Expected: no type errors; PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts
git add packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts
git commit -m "feat(client): Obsidian's shell, Lightning Rod's trail, and the rattle, Sunder and blind marks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Seedling's orb draws as a sprout

`ArenaRenderer`'s private `drawDrop` becomes an exported function (so a test can hand it a recording Graphics), and an orb with `mana: 'nature'` draws as a sprout that grows in, and doesn't bob. Siphon's motes (`mana: 'shadow'`) are violet already: a mote wears `MANA_HEX[d.mana]`. The `pickup` sparkle took red for every orb; `pickupColor` gives a drop with a mana its mana's colour (the `pickup` event carries the drop's `mana`: `dropsTick` passes `d.mana`), so the sprout's pickup sparkles green.

**Files:**
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts` (`drawDrop`)
- Test: `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/delve/__tests__/arena-renderer.test.ts`: replace its imports with

```ts
import { describe, it, expect } from 'vitest';
import type { Graphics } from 'pixi.js';
import type { ArpgEvent, Drop } from '@alloy/engine';
import { drawDrop, pickupColor, pruneViews } from '../arena/ArenaRenderer';
import { MANA_HEX } from '../arena/palette';

/** A Graphics stand-in that records the colours it fills. */
function recorder() {
  const fills: number[] = [];
  const g: Record<string, unknown> = {};
  for (const m of ['clear', 'rect', 'circle', 'ellipse', 'poly', 'stroke']) g[m] = () => g;
  g.fill = (f: { color: number }) => (fills.push(f.color), g);
  return { g: g as unknown as Graphics, fills };
}

const drop = (over: Partial<Drop>): Drop => ({
  id: 1,
  kind: 'orb',
  x: 0,
  y: 0,
  amount: 0.1,
  born: 0,
  vacuum: false,
  dead: false,
  ...over,
});
```

and inside `describe('the arena renderer', …)`, after the existing test, add

```ts

  it("draws a Seedling's orb as a green sprout, a health orb red, and a Siphon mote violet", () => {
    const sprout = recorder();
    drawDrop(sprout.g, drop({ mana: 'nature' }), 1, 1);
    expect(sprout.fills).toContain(MANA_HEX.nature);
    expect(sprout.fills).not.toContain(0xdc2626);
    const orb = recorder();
    drawDrop(orb.g, drop({}), 1, 1);
    expect(orb.fills).toContain(0xdc2626);
    const mote = recorder();
    drawDrop(mote.g, drop({ kind: 'mote', mana: 'shadow' }), 1, 1);
    expect(mote.fills).toContain(MANA_HEX.shadow);
  });

  it("a Seedling orb's pickup sparkles green, a health orb's red", () => {
    const pickup = (over: Partial<Extract<ArpgEvent, { kind: 'pickup' }>>) =>
      pickupColor({ kind: 'pickup', dropId: 1, dropKind: 'orb', amount: 0.1, ...over });
    expect(pickup({ mana: 'nature' })).toBe(MANA_HEX.nature);
    expect(pickup({})).toBe(0xf87171);
    expect(pickup({ dropKind: 'mote', mana: 'shadow' })).toBe(MANA_HEX.shadow);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: 2 FAIL ("(0 , drawDrop) is not a function", "(0 , pickupColor) is not a function").

- [ ] **Step 3: Implement**

In `src/features/delve/arena/ArenaRenderer.ts`:
- in `handleEvents`, the whole `case 'pickup':` block (its `this.fx.burst(…)` with the nested colour ternary, and `break;`) becomes

  ```ts
          case 'pickup':
            this.fx.burst(w.hero.x, w.hero.y, pickupColor(e), 5, 2.5);
            break;
  ```

- in `syncDrops`, `      const bob = d.kind === 'item' ? 0 : Math.sin(this.time * 5 + d.id) * 0.06;` becomes

  ```ts
        // Items lie still, and so does a Seedling's rooted sprout.
        const still = d.kind === 'item' || (d.kind === 'orb' && d.mana === 'nature');
        const bob = still ? 0 : Math.sin(this.time * 5 + d.id) * 0.06;
  ```

- in `syncDrops`, `      this.drawDrop(v, d);` becomes `      drawDrop(v.gfx, d, this.time, age);` (`age` is already computed just above);
- delete the private method `  private drawDrop(v: DropView, d: Drop): void { … }` (all of it, and the blank line after it);
- just above `function lighten(color: number): number {` add

```ts
/** A pickup's sparkle: the item's rarity, else the drop's mana (a mote, a Seedling orb), else red. */
export function pickupColor(e: Extract<ArpgEvent, { kind: 'pickup' }>): number {
  if (e.item) return RARITY_HEX[e.item.rarity];
  if (e.mana) return MANA_HEX[e.mana];
  return e.dropKind === 'orb' ? 0xf87171 : 0xffffff;
}

/**
 * A drop's look, `age` seconds after it fell. A Seedling's orb (nature) is a
 * sprout that grows in; a mote wears its mana's colour (a Siphon's is violet).
 */
export function drawDrop(g: Graphics, d: Drop, time: number, age: number): void {
  g.clear();
  if (d.kind === 'item' && d.item) {
    const color = RARITY_HEX[d.item.rarity];
    const r = d.item.rarity;
    if (r === 'rare' || r === 'epic' || r === 'legendary') {
      const h = r === 'legendary' ? 7 : r === 'epic' ? 5.5 : 4;
      const flicker = 0.75 + Math.sin(time * 3 + d.id) * 0.25;
      g.rect(-0.28, -h, 0.56, h).fill({ color, alpha: 0.1 * flicker });
      g.rect(-0.14, -h * 0.8, 0.28, h * 0.8).fill({ color, alpha: 0.18 * flicker });
      g.rect(-0.05, -h * 0.6, 0.1, h * 0.6).fill({ color: 0xffffff, alpha: 0.25 * flicker });
    }
    g.ellipse(0, 0.12, 0.32, 0.12).fill({ color: 0x000000, alpha: 0.4 });
    g.circle(0, 0, 0.42).fill({ color, alpha: 0.18 });
    g.poly([0, -0.32, 0.24, 0, 0, 0.32, -0.24, 0]).fill({ color });
    g.poly([0, -0.32, 0.24, 0, 0, 0]).fill({ color: 0xffffff, alpha: 0.45 });
    g.poly([0, -0.32, 0.24, 0, 0, 0.32, -0.24, 0]).stroke({
      width: 0.04,
      color: 0x000000,
      alpha: 0.6,
    });
    if (d.item.mana) g.circle(0.26, 0.24, 0.09).fill({ color: MANA_HEX[d.item.mana] });
  } else if (d.kind === 'mote') {
    const color = d.mana ? MANA_HEX[d.mana] : 0x93c5fd;
    g.circle(0, 0, 0.26).fill({ color, alpha: 0.25 });
    g.circle(0, 0, 0.13).fill({ color });
    g.circle(-0.04, -0.04, 0.05).fill({ color: 0xffffff, alpha: 0.8 });
  } else if (d.kind === 'orb' && d.mana === 'nature') {
    // A sprout: its stem and two leaves grow in over half a second.
    const k = Math.min(1, age / 0.5);
    g.ellipse(0, 0.12, 0.26, 0.1).fill({ color: 0x000000, alpha: 0.35 });
    g.rect(-0.03, 0.1 - 0.4 * k, 0.06, 0.4 * k).fill({ color: 0x3f9a3a });
    g.ellipse(-0.12 * k, 0.1 - 0.36 * k, 0.12 * k, 0.06 * k).fill({ color: MANA_HEX.nature });
    g.ellipse(0.12 * k, 0.1 - 0.3 * k, 0.12 * k, 0.06 * k).fill({ color: MANA_HEX.nature });
  } else if (d.kind === 'orb') {
    g.circle(0, 0, 0.32).fill({ color: 0xef4444, alpha: 0.25 });
    g.circle(0, 0, 0.2).fill({ color: 0xdc2626 });
    g.circle(-0.06, -0.06, 0.07).fill({ color: 0xffffff, alpha: 0.8 });
  } else {
    g.circle(0, 0, 0.16).fill({ color: 0xfcd34d });
  }
}

```

(Everything in `drawDrop` but the sprout branch is the old method's body with `this.time` → `time`; `ArpgEvent`, `Graphics` and `Drop` are already imported. `pickupColor` keeps the old colours for items, motes and health orbs.)

- [ ] **Step 4: Run to verify it passes**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts)`
Expected: no type errors; PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts
git add packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts
git commit -m "feat(client): Seedling's orb grows in as a still sprout, and sparkles green when picked up" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: The HUD: the barrier on the life bar, and Galvanize's spark

The HUD has no event channel, so both come through the snapshot: `barrier` (its hp and max) and `galvanizedAt` (`reactionReadyAt.galvanize − reactionCooldown`), plus the world's `t` to judge "just after".

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts` (`ArenaHud`, `snapshot`)
- Modify: `packages/client/src/features/delve/arena/ArenaHud.tsx` (`Vitals`, `AbilityButton`, `SkillBar`)
- Test: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`, `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx`

- [ ] **Step 1: Write the failing tests**

`src/features/delve/__tests__/arena-hud-snapshot.test.ts`: inside `describe('arena HUD snapshot', …)`, after the last test, add

```ts

  it("carries Obsidian's barrier and when Galvanize last fired", () => {
    const w = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    expect(snapshot(w)).toMatchObject({ barrier: null, galvanizedAt: null, t: w.t });
    w.t = 3;
    w.hero.barrier = { hp: 5, max: 8, until: 7 };
    w.hero.reactionReadyAt.galvanize = 2.5;
    const cooldown = registry.getDelveBalance().reactions.reactionCooldown;
    expect(snapshot(w)).toMatchObject({
      barrier: { hp: 5, max: 8 },
      galvanizedAt: 2.5 - cooldown,
      t: 3,
    });
  });
```

`src/features/delve/__tests__/ArenaHud.test.tsx`:
- the imports `import { AttackButton, SkillBar, keyHints, padHints } from '../arena/ArenaHud';` and `import type { ArenaHud } from '../arena/useArena';` become `import { AttackButton, SkillBar, Vitals, keyHints, padHints } from '../arena/ArenaHud';` and `import type { AbilityHud, ArenaHud } from '../arena/useArena';`;
- in `hud()`, after `    cleared: false,` add

  ```ts
      barrier: null,
      galvanizedAt: null,
      t: 10,
  ```

- before `describe('AttackButton', () => {` add

```tsx
describe('the reactions on the HUD', () => {
  it("shows Obsidian's barrier as a pale segment after the life (over its end at full life)", () => {
    const { rerender } = render(<Vitals hud={hud({ hp: 50, barrier: { hp: 20, max: 30 } })} />);
    const seg = screen.getByTestId('hp-barrier');
    expect(seg.style.left).toBe('50%');
    expect(seg.style.width).toBe('20%');
    rerender(<Vitals hud={hud({ hp: 100, barrier: { hp: 20, max: 30 } })} />);
    expect(screen.getByTestId('hp-barrier').style.left).toBe('80%');
    rerender(<Vitals hud={hud()} />);
    expect(screen.queryByTestId('hp-barrier')).toBeNull();
  });

  it('sparks the buttons still cooling down for 0.4 s after Galvanize', () => {
    const cooling: AbilityHud = {
      name: 'Fire Bolt',
      icon: '☄️',
      form: 'bolt',
      element: 'fire',
      elements: ['fire'],
      payment: 'mana',
      cost: 8,
      cooldown: 3,
      cooldownTotal: 5,
      charge: null,
      comboNext: 0,
      comboLength: 1,
      windup: null,
      affordable: true,
      ready: false,
    };
    const abilities = [cooling, { ...cooling, cooldown: 0, ready: true }];
    const bar = (galvanizedAt: number | null) => (
      <SkillBar
        hud={hud({ abilities, galvanizedAt, t: 10 })}
        onCast={() => {}}
        onAim={() => {}}
        onPotion={() => {}}
        onDodge={() => {}}
        hints={null}
      />
    );
    const spark = (slot: number) =>
      screen.getByTestId(`ability-${slot}`).querySelector('[data-spark]');
    const { rerender } = render(bar(9.8));
    expect(spark(0)).not.toBeNull();
    expect(spark(1)).toBeNull();
    rerender(bar(9.5));
    expect(spark(0)).toBeNull();
    rerender(bar(null));
    expect(spark(0)).toBeNull();
  });
});

```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/__tests__/ArenaHud.test.tsx)`
Expected: 3 FAIL: the snapshot ("expected { Object (hp, maxHp, ...) } to match object { barrier: null, …(2) }"), the segment ('Unable to find an element by: [data-testid="hp-barrier"]') and the spark ("expected null not to be null").

- [ ] **Step 3: The snapshot**

`src/features/delve/arena/useArenaCore.ts`:
- `ArenaHud`: after `  cleared: boolean;` add

  ```ts
    /** Obsidian's barrier (the life bar's pale segment), or null. */
    barrier: { hp: number; max: number } | null;
    /** When Galvanize last fired (world seconds), or null: cooling buttons spark just after. */
    galvanizedAt: number | null;
    /** The world's time, for `galvanizedAt`. */
    t: number;
  ```

- `snapshot`'s returned object: after `    cleared: world.cleared,` add

  ```ts
      barrier: h.barrier ? { hp: h.barrier.hp, max: h.barrier.max } : null,
      galvanizedAt:
        h.reactionReadyAt.galvanize === undefined
          ? null
          : h.reactionReadyAt.galvanize - bal.reactions.reactionCooldown,
      t,
  ```

- [ ] **Step 4: The segment and the spark**

`src/features/delve/arena/ArenaHud.tsx`:
- in `Vitals`, after `  const mana = hud.mana / Math.max(1, hud.manaMax);` add

  ```tsx
    // Obsidian's barrier: a pale segment after the life (over its end when there's no room).
    const barrier = hud.barrier ? Math.min(1, hud.barrier.hp / Math.max(1, hud.maxHp)) : 0;
  ```

  and right after the life bar's fill (the `<div className="fill" … />` inside `data-testid="hero-hp"`), add

  ```tsx
          {hud.barrier && (
            <div
              className="absolute inset-y-0"
              data-testid="hp-barrier"
              style={{
                left: `${Math.min(frac, 1 - barrier) * 100}%`,
                width: `${barrier * 100}%`,
                background: 'rgba(254, 215, 170, 0.6)',
              }}
            />
          )}
  ```

- after `const SLOT_LABEL = ['Primary', 'Defensive', 'Ultimate'];` add

  ```tsx
  /** Seconds the buttons still cooling down spark after Galvanize. */
  const GALVANIZE_SPARK = 0.4;
  ```

- `AbilityButton`: its props gain `galvanized` (in the destructuring, after `  busy,`; in the type, after `busy: boolean;`):

  ```tsx
    /** Galvanize just fired: a cooling button sparks. */
    galvanized: boolean;
  ```

  and just before its closing `    </button>`, after the `{hint && ( … )}` block, add

  ```tsx
        {galvanized && cooling && (
          <span
            data-spark
            aria-hidden
            className="pointer-events-none absolute -left-1 -top-1 text-base"
            style={{ textShadow: '0 0 6px #d8f56a' }}
          >
            ⚡
          </span>
        )}
  ```

- `SkillBar`: before its `  return (` add

  ```tsx
    const galvanized =
      !!hud && hud.galvanizedAt !== null && hud.t - hud.galvanizedAt < GALVANIZE_SPARK;
  ```

  and in its `<AbilityButton … />`, after `          busy={hud.busy}` add `          galvanized={galvanized}`.

(`.delve-hpbar` is `position: relative; overflow: hidden`, so the segment sits in the bar under its text.)

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve)`
Expected: no type errors; PASS.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/ArenaHud.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/__tests__/ArenaHud.test.tsx
git add packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/ArenaHud.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/__tests__/ArenaHud.test.tsx
git commit -m "feat(client): the barrier on the life bar, and Galvanize sparks the cooling buttons" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Seedling's vines on the pixel floor

The `hit` event carrying `reaction: 'seedling'` already crosses to the floor worker (`FLOOR_EVENTS` keeps every hit; the `reaction` event doesn't cross). Crystallize's frost burst needs nothing: it is an `explode` with `element: 'frost'`, which the floor already stamps.

**Files:**
- Modify: `packages/client/src/features/delve/arena/pixel/arena-effects.ts` (`applyArenaEvent`'s `hit`)
- Test: `packages/client/src/features/delve/__tests__/pixel-world.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/delve/__tests__/pixel-world.test.ts`: `import type { ArpgEvent, ManaType } from '@alloy/engine';` becomes `import type { ArpgEvent, ManaType, ReactionId } from '@alloy/engine';`, and at the end of the file add

```ts

describe('reactions on the pixel floor', () => {
  it('a Seedling hit grows a small patch of vines where it sprouts; other hits grow none', () => {
    const f = spyFloor();
    const hit = (reaction?: ReactionId): ArpgEvent => ({
      kind: 'hit',
      id: 1,
      x: 10,
      y: 10,
      amount: 5,
      crit: false,
      element: 'earth',
      heft: 0,
      source: 'skill',
      reaction,
    });
    applyArenaEvent(f.pw, hit('seedling'), PPU, MARGIN);
    applyArenaEvent(f.pw, hit('sunder'), PPU, MARGIN);
    applyArenaEvent(f.pw, hit(), PPU, MARGIN);
    expect(f.stamps).toEqual([{ brush: 'nature', ...arenaToCell(10, 10, PPU, MARGIN), r: 4 }]);
  });
});
```

(`spyFloor` is the file's existing recording floor: `sprout` records a `nature` stamp.)

- [ ] **Step 2: Run it to verify it fails**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/pixel-world.test.ts)`
Expected: FAIL ("expected [] to deeply equal [ { brush: 'nature', x: 65, …(2) } ]").

- [ ] **Step 3: Implement**

`src/features/delve/arena/pixel/arena-effects.ts`, `applyArenaEvent`'s `case 'hit':` becomes

```ts
    case 'hit': {
      const c = arenaToCell(e.x, e.y, ppu, margin);
      pw.hitSpark(c.x, c.y, e.element);
      // Seedling: a small patch of vines where the orb sprouts.
      if (e.reaction === 'seedling') pw.sprout(c.x, c.y, 4);
      break;
    }
```

(Nature's brush spawns no particles, so it grows even when the floor is past half its particle cap.)

- [ ] **Step 4: Run to verify it passes, and the whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all client tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/pixel/arena-effects.ts packages/client/src/features/delve/__tests__/pixel-world.test.ts
git add packages/client/src/features/delve/arena/pixel/arena-effects.ts packages/client/src/features/delve/__tests__/pixel-world.test.ts
git commit -m "feat(client): Seedling grows vines on the pixel floor" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 6: Release

### Task 19: E2E, and a screenshot pass over the fifteen

The only E2E assumption about reactions is D04's count of undiscovered ones (`e2e/delve-gamepad.spec.ts` and `e2e/delve-training.spec.ts` make none).

**Files:**
- Modify: `packages/client/e2e/delve.spec.ts` (D04)
- Create (scratch, never committed): `packages/client/playwright.scratch.config.ts` (see the header), `packages/client/e2e/reaction-shots.spec.ts`

- [ ] **Step 1: Update D04**

In `e2e/delve.spec.ts`, D04: `    await expect(page.getByTestId('reaction-unknown')).toHaveCount(7);` becomes `    await expect(page.getByTestId('reaction-unknown')).toHaveCount(15);`.

- [ ] **Step 2: Run the E2E**

Create the scratch config (header) and restart the 5288 dev server (header block; expect `True`).

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: all pass on the four device projects. A consistent failure is a regression: read the page's console and the save (`localStorage['alloy:delve:v2']`), not longer timeouts.

- [ ] **Step 3: Look at the reactions**

Create `packages/client/e2e/reaction-shots.spec.ts` (scratch: never committed):

```ts
import { test, expect, type Page } from '@playwright/test';
import {
  createDefaultRegistry,
  createDelveProfile,
  defaultAbilities,
  type ManaType,
} from '@alloy/engine';

/**
 * SCRATCH (pair reactions plan, Task 19): never committed. For each of the 15
 * pairs, the Training Grounds with one dummy, cooldowns on, invulnerable, and
 * a fused Primary (a Bolt of the pair's two elements, which sets off their
 * reaction from its second hit), the engine bot fighting at half speed with a
 * staff of the first element. Crops round the arena's middle, and one full
 * frame for the HUD, go to SHOTS_DIR: a folder in your scratchpad, never the repo.
 */
const OUT = process.env.SHOTS_DIR;
if (!OUT) throw new Error('Set SHOTS_DIR to a folder in your scratchpad');
const registry = createDefaultRegistry();
/**
 * Dummies never strike back, so these get attackers: Obsidian's barrier must
 * drain and shatter (Invulnerable blocks life loss, not the barrier), and
 * Lightning Rod's trail shows only while the bot walks.
 */
const ATTACKED = new Set(['obsidian', 'lightning_rod']);

async function seed(page: Page, [a, b]: readonly [ManaType, ManaType]): Promise<void> {
  const save = JSON.stringify(createDelveProfile(registry, 4242, { primary: 'fire' }));
  const sandbox = JSON.stringify({
    weapon: { baseId: 'staff', mana: a, rarity: 'rare' },
    loadedWeapon: null,
    gear: {},
    legendaries: {},
    attunement: {},
    abilities: {
      ...defaultAbilities(a),
      primary: { form: 'bolt', elements: [a, b], weight: 0, payment: 'mana' },
    },
    depth: 5,
    dummyElement: null,
    dummies: [{ layout: 'single', element: null }],
    toggles: { infiniteMana: true, noCooldowns: false, invulnerable: true },
    slowmo: 0.5,
    primary: a,
    basicInfusion: null,
  });
  await page.addInitScript(
    ([delve, training]) => {
      if (sessionStorage.getItem('reaction-shots')) return;
      localStorage.clear();
      localStorage.setItem('alloy:delve:v2', delve);
      localStorage.setItem('alloy:delve:sandbox:v1', training);
      localStorage.setItem('alloy:delve:autopilot', '1');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('reaction-shots', '1');
    },
    [save, sandbox] as const,
  );
}

for (const { id, elements } of registry.getArpgData().reactions)
  test(`reaction shots: ${id}`, async ({ page }) => {
    await seed(page, elements);
    await page.goto('/delve');
    await page.getByTestId('training-button').click();
    const canvas = page.locator('[data-testid="arena"] canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('ability-0')).toBeVisible({ timeout: 30_000 });
    if (ATTACKED.has(id)) {
      // The panel is docked (open) on desktop, a sheet on phones; spawn the default 3 foes.
      const panel = page.getByTestId('training-panel');
      if (!(await panel.isVisible())) await page.getByTestId('training-panel-toggle').click();
      await page.getByTestId('training-tab-targets').click();
      await page.getByTestId('spawn-button').click();
      if ((await panel.getAttribute('data-layout')) === 'sheet')
        await page.getByTestId('training-panel-close').click();
    }
    await page.waitForTimeout(1500); // the bot reaches the dummy and marks it
    const box = (await canvas.boundingBox())!;
    const size = Math.min(560, box.width, box.height);
    const clip = {
      x: box.x + box.width / 2 - size / 2,
      y: Math.max(box.y, box.y + box.height / 2 - size / 2 - 100),
      width: size,
      height: size,
    };
    for (let n = 0; n < 16; n++) {
      await page.screenshot({ path: `${OUT}/${id}-${String(n).padStart(2, '0')}.png`, clip });
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: `${OUT}/${id}-hud.png` });
  });
```

Run, with `<scratchpad>` your session's scratchpad directory (forward slashes): `(cd packages/client && SHOTS_DIR="<scratchpad>/reaction-shots" npx playwright test -c playwright.scratch.config.ts --project desktop e2e/reaction-shots.spec.ts)`
Expected: 15 passed; 17 PNGs per reaction in `<scratchpad>/reaction-shots/`, none in the repo.

View them with the Read tool and check, reaction by reaction:
- every reaction floats its name from the data (`LIGHTNING ROD!`, never `undefined`) in its `REACTION_HEX` colour, with its ring;
- Obsidian: embers gathering onto the hero, then an ember shell round it that thins as the spawned attackers' blows drain it (Invulnerable still drains the barrier) and shatters into ember and glass pixels; its HUD frame shows the pale barrier segment on the life bar (the shatter's `orbRemove` sound is muted here: its unit test covers it);
- Lightning Rod: a bolt dropping into the ground at the hero; a storm trail behind it as the bot walks among the attackers;
- Sunder: rock chips bursting off the dummy, then a small earth-coloured crack over it;
- Seedling: a green puff, a sprout growing in where the dummy stands, and vines on the floor under it;
- Siphon: a violet flash at the dummy and three violet motes flying to the hero;
- Crystallize: frost spikes bursting outward;
- Blackout: a dark cloud on the ground with violet wisps, then a dim smoke over the dummy's eyes;
- Galvanize: storm sparks at the hero; a HUD frame may catch the ⚡ on a cooling button;
- a dummy that an Earth source staggered has rock chips circling low at its feet (the Earth pairs);
- the seven older reactions look as they did (label and ring only), nothing draws twice, and nothing new is invisible.

If a look doesn't read, tune only its cosmetic numbers (sizes, counts, colours, alphas) in `arena/fx/reactions.ts` or `arena/fx/draw-world.ts`, keep `(cd packages/client && npx vitest run src/features/delve/arena/fx)` green, and reshoot that reaction (`-g "reaction shots: <id>"`). Commit each fix:

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/fx/reactions.ts packages/client/src/features/delve/arena/fx/draw-world.ts
git add packages/client/src/features/delve/arena/fx/reactions.ts packages/client/src/features/delve/arena/fx/draw-world.ts
git commit -m "fix(client): tune <reaction>'s look from the screenshots" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Delete `e2e/reaction-shots.spec.ts` when done (keep the scratch config for Task 20).

- [ ] **Step 4: Commit the spec**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/e2e/delve.spec.ts
git add packages/client/e2e/delve.spec.ts
git commit -m "test(client): the Anvil lists fifteen reactions to discover" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Docs, version, full verification

**Files:**
- Modify: `CLAUDE.md` (CRLF), `docs/superpowers/specs/2026-09-28-delve-pair-reactions-design.md` (CRLF; status line), `packages/client/package.json` (version)

- [ ] **Step 1: Docs and version**

In `CLAUDE.md`, the Delve section:

1. In the Delve Mode paragraph, `Mixing elements triggers reactions (Melt, Shatter, Overload, Superconduct, Soulfire, Combust, Blight).` becomes `Mixing elements triggers reactions: every pair of elements has one, set off both ways (15, from Melt to Galvanize).`
2. After the **Elemental affinity** bullet, add:

```markdown
- **Pair reactions** (spec: `docs/superpowers/specs/2026-09-28-delve-pair-reactions-design.md`): every pair of elements reacts, both ways: a hit of either element on a foe carrying the other's **mark** (its status: burning; chilled or frozen; shocked; rattled; hexed; poisoned; `hasMark` in `arpg/combat.ts`) sets off the pair's reaction and uses the mark up (Soulfire and Blight keep it; Shatter and Superconduct take part of theirs). The table is `arpg.json → reactions` (`elements`, `consumes`, `cooldown`; `registry.getReactionFor(a, b)`), checked by one `ReactionIdSchema` that the save's `reactionsSeen` uses too; with several marks, `MANA_TYPES` order decides (`findReaction`), and each effect is one `case` in `react`. Earth's mark is `rattledUntil`, set only by a stagger from a source that includes Earth (`HitOpts.rattles`). The eight added in v0.44.0: Obsidian (a barrier, `HeroEntity.barrier`, soaking in `shieldHero` after the Defensive and before the Ward), Lightning Rod (`refundDodgeCharge`, `quickUntil`), Sunder (`sunderUntil`), Seedling and Siphon (an orb and motes, which the Training Grounds get too), Crystallize, Blackout and Galvanize; the five buff ones wait `reactionCooldown` (`HeroEntity.reactionReadyAt`). Numbers: `balance.json → delve.reactions`. The client draws the moment in `arena/fx/reactions.ts`, the lasting states in `fx/draw-world.ts`, and the barrier and Galvanize on the HUD through the snapshot. `tests/delve-pacing.test.ts` also sweeps all 15 pairs, forced (`AutopilotOptions.secondary`).
```

3. In the **Training Grounds** bullet, `` builds an arena that never clears and drops nothing (`createSandboxWorld`) `` becomes `` builds an arena that never clears and drops nothing but reactions' orbs and motes (`createSandboxWorld`) ``.

In the spec, `**Status:** Draft.` becomes `**Status:** Built in v0.44.0.`

In `packages/client/package.json`, `"version": "0.43.1",` becomes `"version": "0.44.0",`.

- [ ] **Step 2: Full verification**

Run, and check each is green before claiming anything:
- `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)` (the pacing gate included)
- `(cd packages/engine && pnpm build)`
- `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
- restart the 5288 dev server (header block; `True`), then `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`

Expected: all green. Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/Alloy
git add CLAUDE.md docs/superpowers/specs/2026-09-28-delve-pair-reactions-design.md packages/client/package.json
git commit -m "docs: pair reactions in the Delve notes" -m "chore(client): bump version to 0.44.0" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

`git status` must show nothing of this work left: only the three untracked 2026-05-01 plan docs. Don't push: the user pushes after a final review.
