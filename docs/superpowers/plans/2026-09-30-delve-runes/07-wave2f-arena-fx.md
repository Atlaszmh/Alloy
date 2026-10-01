# Delve Runes, Wave 2F: Arena Visuals — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The arena shows runes at work. A small mana-pixel glyph flashes where a rune's effect fires (`runeFx`: Split, Echo, Volatile); a rune on the floor is a stone in its family's colour, named with its tier, with its own pickup sound; and each HUD ability button, and the ⚔️ manual-attack button, wears one dot per rune acting on the move (or blow) it makes next, in the rune's family colour. Everything else a rune adds (extra shots, shards, echoes, zones, Guard's barrier) already draws through the existing paths; one test pins that.

**Architecture:** Client only, no engine change. A new `fx/runes.ts` (like `fx/reactions.ts`) holds the glyphs, the family colours for Pixi and the `runeFx` handler; `ManaFx` gains one transient kind, `glyph`, drawn first in the infusion pass so its cells come off the frame's `InfusionBudget`. `ArenaRenderer` routes the `runeFx` event and draws rune drops (`drawDrop`, `dropLabel`, `pickupColor`); `arena-sounds.ts` plays theirs. The HUD snapshot (`useArenaCore.ts`) gains `AbilityHud.runes` (from `pressMove`) and `ArenaHud.basicRunes` (from `basicStep`), both read from what wave 1A resolved (`ResolvedAbility.runes`, `HeroBlow.runes`: active runes only), so the dots and the builder's dormant marks always agree. `ArenaHud.tsx` draws the dots (`RunePips`). Colours come from wave 1C's `FAMILY_STYLE`, one source for CSS and Pixi.

**Tech Stack:** TypeScript 5.7, React 19, PixiJS 8, Vitest 3 (jsdom, Testing Library), Playwright (the browser check, through the Playwright MCP tools).

**Spec:** `docs/superpowers/specs/2026-09-30-delve-runes-design.md` at `81b0e31`: "The arena", "The HUD pip", and wave 2's area F in "Build waves". Read the overview (`00-overview.md`) for the shared conventions.

---

**Base:** the commit the controller makes by merging wave 1 (areas A, B and C) on top of wave 0. This area needs:
- **wave 0:** the `runeFx` event, `Drop.rune`, the `'rune'` drop kind, the pickup event's `rune`, `RuneRef`, `RuneFamily`, `ResolvedAbility.runes`, `HeroBlow.runes`, the optional `runes` on `Move` and `Blow` (and so on the sandbox's saved chains, which use the engine's `ChainSchema` and `BlowSchema`), and the registry's `getRunes`, `getRune` and `findRune`;
- **wave 1A:** `ResolvedAbility.runes` and `HeroBlow.runes` filled with the active runes (the snapshot test), and the `runeFx` events (the browser check);
- **wave 1B:** rune drops on the floor (the browser check only; the unit tests use synthetic drops);
- **wave 1C:** `packages/client/src/features/delve/runes/rune-style.ts` and its `FAMILY_STYLE`.

**Worktree:** `git worktree add ../alloy-arena-fx -b runes/arena-fx <base>`, its `node_modules` linked as the overview says (`packages/client/node_modules/@alloy/engine` pointing at the worktree's own `packages/engine`). Every path below is repo-relative; run every command from the worktree's root, `/c/Projects/alloy-arena-fx` in Bash.

**Before Task 1:** build the engine the client reads, and check the contract is in it:

Run: `(cd packages/engine && npx tsup) && grep -c "runeFx" packages/engine/dist/index.d.ts && test -f packages/client/src/features/delve/runes/rune-style.ts && echo ok`
Expected: the build succeeds, a count above 0, then `ok`.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors and every test passes. Write the count down (at `81b0e31` it was 781 tests in 91 files; waves 0 and 1C add theirs). This plan adds 11 tests and 1 file to it.

---

## Conventions

The overview's, with these:
- **Commands** (from the worktree's root):

  | What | Command |
  |---|---|
  | Some client tests | `(cd packages/client && npx vitest run <paths>)` |
  | The whole client | `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` |
  | Client build | `(pnpm -F @alloy/client build)` |
  | Engine build (only before Task 1; this area changes no engine file) | `(cd packages/engine && npx tsup)` |

- **Prettier:** every file this plan edits passed `npx prettier --check` at `81b0e31`, and the code below is already formatted (checked on a scratch copy), so the commit blocks' `--write` changes nothing if typed as written. None of them is on the overview's never-format list.
- **Line endings:** every file here is LF.
- **Vitest doesn't type-check:** each task runs the client typecheck too.

**Dev server on 5291** (Task 4; PowerShell, from the worktree; 5291 so it never takes the 5288 server the user plays on). It stops whatever owns the port, starts a detached Vite, waits for a 200 and prints `True`:

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5291 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\alloy-arena-fx\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5291 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5291').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

---

## What already draws (the check of wave 1A's output)

Read against the client at `81b0e31`; Task 1's last test pins the two shapes that are new to the existing code (a shard, a zone without an ability).

| Wave 1A emits | Drawn by | Verdict |
|---|---|---|
| Extra Bolts and shot blows (Multi-shot, Pierce) | `drawProjectiles`, `Lifecycles` (a spark as each is born, a 6-pixel dissolve as it ends) | draws; nothing to add |
| A Lance fan | one `beam` event per beam (`ManaFx.beam`) | draws |
| Shards (`form: 'shard'`; an ability's carries a copy of its move, a basic one `ability: null`) | `drawProjectiles`' plain branch, an orb at 0.15 (ability) or half the shot's radius (basic); an ability shard of a two-element move wears its second element's motif in `drawInfusions`, inside the budget | draws |
| Shard impacts: `silent`, no `explode` event | the renderer's blast rings, burst and shake, the infused blast rim and the pixel floor's craters (`arena-effects.ts`) all come only from `explode` events; a shard's hit is a `hit` (sparks, a number), its end `Lifecycles`' 6-pixel dissolve; the floor engine marks in flight only Bolt-form shots (`source === 'bolt'`) | nothing draws an explosion for a shard |
| Echoes of an ability (through `executeForm`, no `cast` event) | the form's own events and projectiles | draws, plus the Echo glyph (Task 1) |
| Echoes of a blow | a shot blow's echo spawns its shot (draws); a melee blow's echo lands its hits through `landBlow` with no `basic` event, so it shows as hit sparks and the Echo glyph, without a swing smear | see Cross-area needs, 2 |
| Linger zones: an ability's (the merged `zone` knob) | `drawZones`' lingering ground, `Lifecycles`' dissolve, its rim motif | draws |
| Linger zones: a blow's (a hero zone, `ability: null`) | `drawZones`' lingering ground (it reads `z.element`); `drawInfusions` reads `z.ability?.elements[1]` and skips it | draws, no motif |
| Guard's shield (`HeroEntity.barrier`) | `drawGuard`'s Obsidian shell, the HUD's pale life segment (`hp-barrier`), `barrierBreakFx` | draws, as the spec says ("reuses the barrier's … break event and HUD") |
| `runeFx` events | nothing yet | Task 1 |
| Rune drops (`Drop.kind: 'rune'`) | `drawDrop`'s last branch: today a rune would look like a scrap coin | Task 2 |

---

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/arena/fx/runes.ts` (new) | the three effect glyphs, `familyHex`, `runeHex`, `TIER_NUMERAL`, `runeFx` |
| `packages/client/src/features/delve/arena/fx/__tests__/runes.test.ts` (new) | the flashes, the colours, `ManaFx`'s glyphs and the budget, and the pin of the existing paths |
| `packages/client/src/features/delve/arena/fx/mana-fx.ts` | `ManaFx.glyph`: a transient glyph, drawn first in the infusion pass, off the budget |
| `packages/client/src/features/delve/arena/ArenaRenderer.ts` | the `runeFx` case; a rune drop's stone (`drawDrop`), its name (`dropLabel`, now the item labels' too), its pickup sparkle (`pickupColor`); runes lie still |
| `packages/client/src/features/delve/arena/arena-sounds.ts` | a rune's drop and pickup sounds |
| `packages/client/src/features/delve/arena/useArenaCore.ts` | the HUD snapshot only: `AbilityHud.runes`, `ArenaHud.basicRunes` |
| `packages/client/src/features/delve/arena/ArenaHud.tsx` | `RunePips` on each ability button and on the ⚔️ button |
| `packages/client/src/features/delve/__tests__/arena-renderer.test.ts` | rune drops |
| `packages/client/src/features/delve/__tests__/arena-sounds.test.ts` | rune sounds |
| `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx` | the dots; the fixtures gain `runes` and `basicRunes` |
| `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts` | the snapshot's runes, dormant ones left out |

`arena-sounds.ts` is outside the overview's "Owns" column for F, but the spec's wave-2 line gives it to F ("rune drops in `ArenaRenderer` and `arena-sounds.ts`") and no other area touches it. See Cross-area needs, 4.

---

## Cross-area needs

1. **Wave 1C (`features/delve/runes/rune-style.ts`): `FAMILY_STYLE[family].color` is a six-digit `#rrggbb` string.** The arena reads it for Pixi through `cssToHex` (`familyHex` in `fx/runes.ts`), so the dots and the floor's stones share one colour per family. Task 1's test fails on anything else (`Number.isInteger(familyHex(f))`). If C chose another CSS form, the fix is in C's file (or in `familyHex`, one line). The spec's colours: Shape cyan, Tempo amber, Elemental violet, Sustain green.
2. **Optional, cosmetic, not needed by this plan: a melee blow's echo has no swing smear.** The spec routes a blow's echo through `landBlow` (the damage half), and the `basic` event the renderer draws a swing from stays in `strike`, so a melee echo reads as hit sparks under the Echo glyph. If the user wants the smear, wave 1A's `echoTick` (`arpg/abilities/echo.ts`) could push the same event after the blow branch's `landBlow(…)`, with `h` the hero, `w = h.stats.weapon`, `blow = w.blows[echo.blow]`, and `kind` and `row` the kind and row it struck with (the held stage's when `echo.stage` is set). **But** `arpg/dps-sim.ts`'s `acted` (area D) counts `basic` events as swings, so it would count each echo as a use too; that needs D's `acted` to tell them apart, which the contract's event can't. So it is a question for the controller, and the client needs no change either way:

   ```ts
   ctx.events.push({
     kind: 'basic',
     x: h.x,
     y: h.y,
     tx: h.x + echo.dir.x * w.range,
     ty: h.y + echo.dir.y * w.range,
     element: blow.element,
     melee: w.kind === 'melee',
     heft: row.heft,
     step: echo.blow,
     moveKind: kind,
     dir: echo.dir,
   });
   ```

   The renderer's `basic` case would draw it as it is (and kick the camera). No sound, hit-stop or Training meter reads `basic` events.
3. **Wave 1B (assumed, no change asked):** `dropRune` spawns through `combat.ts`'s `spawnDrop` (so a `drop` event with `dropKind: 'rune'` fires, for the drop sound), and `dropsTick`'s pickup event carries `rune: d.rune` (the contract's field; `pickupColor` reads it). If either is missing, the drop is silent or the pickup sparkles white; nothing breaks.
4. **The overview:** add `features/delve/arena/arena-sounds.ts` to F's "Owns" column.

---

## Where the spec left room

- **The glyphs are drawn, not emoji.** "a brief mana-pixel flash" can't draw a rune's `icon` (an emoji), so each of the three effects gets a 5×5 pixel glyph (`GLYPHS`: Split an X of shards, Echo two arcs, Volatile a spark), drawn in 2×2-pixel cells (a glyph is one unit across) 0.9 units above the event's point, white for its first 15%, then its rune's family colour, rising 4 pixels and fading over 0.45 s, over a 0.6 ring in the event's element (the family's when it has none). The effect's family is fixed per effect (`EFFECT_FAMILY`: Split Shape, Echo Tempo, Volatile Elemental), so the flash needs no rune id.
- **The budget.** A glyph is drawn whole while the frame's `InfusionBudget` covers its lit cells (9 to 13), or skipped that frame (it still ages), and is drawn first in the infusion pass: it is the rune's only tell, and the cheapest carrier. A Split Barrage's nine impacts cost about 100 of the frame's 600.
- **A rune on the floor** "draws as its glyph in its family's colour": a dark stone outlined and glowing in the family colour, one notch per tier, and a floating name like a rare item's, "✳️ Split III" (the rune's `icon`, `name` and tier numeral), in the family colour. It lies still like an item and hops as it lands. Its drop plays `lootDrop` (an item's), its pickup `upgradeTier`, and its pickup sparkles in the family colour.
- **`AbilityHud.runes` follows the spec's `pressMove`**, the move a press made now casts. The button's name, kind and step dots read `pressStep` (`nextMove`); the two differ only during the slot's own wind-up, where the dots already show the move after the winding one.
- **The dots** sit centred across the button's top rim (`-top-1`), below the hold and channel bars (`-top-2`) and clear of the key hint at the right edge; `pointer-events-none`, `aria-hidden`. Each has `data-rune` (its id) for tests.
- **Tier numerals** live in `fx/runes.ts` (`TIER_NUMERAL`). If wave 1C exports its own, Task 2 can import that one instead.

---

## Chunk 1: Glyph flashes and runes on the floor

### Task 1: A rune's effect flashes its glyph

**Files:**
- Create: `packages/client/src/features/delve/arena/fx/runes.ts`
- Create: `packages/client/src/features/delve/arena/fx/__tests__/runes.test.ts`
- Modify: `packages/client/src/features/delve/arena/fx/mana-fx.ts` (the `Glyph` carrier)
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts` (the `runeFx` case)

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/arena/fx/__tests__/runes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Graphics } from 'pixi.js';
import type { ArpgWorld, RuneFamily } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { FAMILY_STYLE } from '../../../runes/rune-style';
import { MANA_HEX, cssToHex } from '../../palette';
import { GLYPHS, GLYPH_LIFT, familyHex, runeFx, runeHex, type RuneEffect } from '../runes';
import { GLYPH_LIFE, ManaFx } from '../mana-fx';
import { INFUSION_BUDGET } from '../infusion';
import { drawInfusions, drawProjectiles, drawZones } from '../draw-world';

/** A Graphics stand-in that counts pixels (`px` draws one rect per pixel block). */
function fakeGraphics() {
  const g = { rects: 0, rect: () => (g.rects++, g), fill: () => g };
  return g;
}
const G = () => fakeGraphics() as unknown as Graphics & { rects: number };
const B = () => ({ left: INFUSION_BUDGET });
const lit = (rows: readonly string[]) => rows.join('').split('#').length - 1;

const FAMILY: Record<RuneEffect, RuneFamily> = {
  split: 'shape',
  echo: 'tempo',
  volatile: 'elemental',
};

describe("a rune's effect firing", () => {
  it("flashes its glyph above the point in its rune's family colour, over a ring in the element's", () => {
    for (const effect of ['split', 'echo', 'volatile'] as const) {
      const fx = { glyph: vi.fn(), ring: vi.fn() };
      runeFx(fx as unknown as ManaFx, { kind: 'runeFx', effect, x: 4, y: 6, element: 'frost' });
      const color = cssToHex(FAMILY_STYLE[FAMILY[effect]].color);
      expect(fx.glyph, effect).toHaveBeenCalledWith(4, 6 - GLYPH_LIFT, GLYPHS[effect], color);
      expect(fx.ring.mock.calls[0].slice(0, 4), effect).toEqual([4, 6, 0.6, MANA_HEX.frost]);
      // Every glyph is 5×5 cells.
      expect(GLYPHS[effect].map((row) => row.length)).toEqual([5, 5, 5, 5, 5]);
    }
    // No element (a Volatile Soulfire carries none): the ring takes the family's colour.
    const fx = { glyph: vi.fn(), ring: vi.fn() };
    runeFx(fx as unknown as ManaFx, { kind: 'runeFx', effect: 'echo', x: 0, y: 0, element: null });
    expect(fx.ring.mock.calls[0][3]).toBe(familyHex('tempo'));
  });

  it("each family has its own colour, and a rune wears its family's", () => {
    const families = Object.keys(FAMILY_STYLE) as RuneFamily[];
    const colors = families.map(familyHex);
    for (const c of colors) expect(Number.isInteger(c)).toBe(true); // not NaN: a #rrggbb colour
    expect(new Set(colors).size).toBe(4);
    const split = getDelveRegistry().getRune('split');
    expect(runeHex({ id: 'split', tier: 3 })).toBe(familyHex(split.family));
    expect(runeHex({ id: 'no-such-rune', tier: 1 })).toBe(0xffffff);
  });
});

describe('ManaFx glyphs', () => {
  it("draw every lit cell off the frame's budget, and skip a frame the budget can't cover", () => {
    const fx = new ManaFx();
    fx.glyph(2, 2, GLYPHS.volatile, 0x22d3ee);
    const air = G();
    const budget = B();
    fx.draw({ air, ground: G() }, 0.01, 0, budget);
    expect(air.rects).toBe(lit(GLYPHS.volatile));
    expect(budget.left).toBe(INFUSION_BUDGET - lit(GLYPHS.volatile));
    const tight = { left: lit(GLYPHS.volatile) - 1 };
    const starved = G();
    fx.draw({ air: starved, ground: G() }, 0.01, 0, tight);
    expect(starved.rects).toBe(0);
    expect(tight.left).toBe(lit(GLYPHS.volatile) - 1);
  });

  it('end after their flash, and clear() lets them go', () => {
    const fx = new ManaFx();
    fx.glyph(2, 2, GLYPHS.split, 0x22d3ee);
    const air = G();
    fx.draw({ air, ground: G() }, GLYPH_LIFE, 0, B());
    expect(air.rects).toBe(0);
    const cleared = new ManaFx();
    cleared.glyph(2, 2, GLYPHS.split, 0x22d3ee);
    cleared.clear();
    const none = G();
    cleared.draw({ air: none, ground: G() }, 0.01, 0, B());
    expect(none.rects).toBe(0);
  });
});

describe('what the runes add, drawn by the existing paths', () => {
  it("draws shards as small orbs and a blow's Linger zone on the ground, neither with a motif", () => {
    const shard = { owner: 'hero', form: 'shard', x: 3, y: 3, vx: 12, vy: 0, radius: 0.2 };
    const w = {
      t: 1,
      hero: { x: 0, y: 0, defend: null, chains: [] },
      projectiles: [
        // A basic shot's shard (no move) and an ability's (a copy of its move).
        { ...shard, id: 7, element: 'fire', pierce: false, ability: null },
        { ...shard, id: 8, element: 'frost', pierce: false, ability: { elements: ['frost'] } },
      ],
      // A heavy blow's Linger: a hero zone with no ability.
      zones: [
        {
          id: 9,
          owner: 'hero',
          x: 5,
          y: 5,
          radius: 1.2,
          element: 'fire',
          source: null,
          ability: null,
          detonateAt: 0,
          born: 0,
          until: 3,
        },
      ],
    } as unknown as ArpgWorld;
    const air = G();
    drawProjectiles(air, w, 1, new Map(), () => undefined);
    expect(air.rects).toBeGreaterThan(0);
    const ground = G();
    drawZones(ground, w, 1);
    expect(ground.rects).toBeGreaterThan(0);
    const budget = B();
    drawInfusions({ air: G(), ground: G() }, w, 1, budget);
    expect(budget.left).toBe(INFUSION_BUDGET);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/runes.test.ts)`
Expected: FAIL: the file doesn't load (`Failed to resolve import "../runes" from "src/features/delve/arena/fx/__tests__/runes.test.ts". Does the file exist?`), no tests run.

- [ ] **Step 3: The glyphs**

Create `packages/client/src/features/delve/arena/fx/runes.ts`:

```ts
import type { ArpgEvent, RuneFamily, RuneRef } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { FAMILY_STYLE } from '../../runes/rune-style';
import { MANA_HEX, cssToHex } from '../palette';
import type { ManaFx } from './mana-fx';

/**
 * Runes in the arena: the flash when a rune's effect fires (a `runeFx` event:
 * Split's shards, an Echo, a reaction Volatile boosted) and the colour a rune
 * wears on the floor. Everything else a rune adds (shots, shards, echoes,
 * zones, Guard's barrier) draws through the existing paths. Cosmetic, so it
 * may use Math.random (ManaFx does).
 */

type RuneFxEvent = Extract<ArpgEvent, { kind: 'runeFx' }>;
export type RuneEffect = RuneFxEvent['effect'];

/** Each effect's glyph: 5×5 cells, '#' lit, each drawn as a 2×2-pixel block. */
export const GLYPHS: Record<RuneEffect, readonly string[]> = {
  // Shards flying apart.
  split: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  // A ring answering a ring.
  echo: ['#..#.', '.#..#', '.#..#', '.#..#', '#..#.'],
  // A spark going off.
  volatile: ['..#..', '.###.', '#####', '.###.', '..#..'],
};

/** The family of each effect's rune. */
const EFFECT_FAMILY: Record<RuneEffect, RuneFamily> = {
  split: 'shape',
  echo: 'tempo',
  volatile: 'elemental',
};

/** How far above its point a glyph flashes (world units), clear of the hit's sparks. */
export const GLYPH_LIFT = 0.9;

/** Tier numerals, I to V (index tier − 1). */
export const TIER_NUMERAL = ['I', 'II', 'III', 'IV', 'V'] as const;

/** A family's colour for Pixi (`FAMILY_STYLE` holds it as CSS). */
export function familyHex(family: RuneFamily): number {
  return cssToHex(FAMILY_STYLE[family].color);
}

/** A rune's colour: its family's (white for an id the data doesn't have). */
export function runeHex(ref: RuneRef): number {
  const def = getDelveRegistry().findRune(ref.id);
  return def ? familyHex(def.family) : 0xffffff;
}

/**
 * A rune's effect fires: its glyph flashes above the point in its family's
 * colour, over a small ring in the element's (the family's without one).
 */
export function runeFx(fx: ManaFx, e: RuneFxEvent): void {
  const color = familyHex(EFFECT_FAMILY[e.effect]);
  fx.glyph(e.x, e.y - GLYPH_LIFT, GLYPHS[e.effect], color);
  fx.ring(e.x, e.y, 0.6, e.element ? MANA_HEX[e.element] : color, false, 0.25);
}
```

In `packages/client/src/features/delve/arena/fx/mana-fx.ts`:

Replace:

```ts
/**
 * How long each transient carrier lasts, and how strongly it draws (a heavy
```

with:

```ts
/** A rune's glyph flashing over its point (fx/runes.ts). */
interface Glyph {
  x: number;
  y: number;
  /** Rows of cells, '#' lit, each a 2×2-pixel block. */
  rows: readonly string[];
  color: number;
  /** Its lit cells: what drawing it takes off the frame's budget. */
  cells: number;
  age: number;
}

/**
 * How long each transient carrier lasts, and how strongly it draws (a heavy
```

Replace:

```ts
const SWEEP_SECONDS = 0.1;
```

with:

```ts
const SWEEP_SECONDS = 0.1;
/** A rune glyph's flash: how long it lasts, the share of that it is white, and the pixels it rises. */
export const GLYPH_LIFE = 0.45;
const GLYPH_WHITE = 0.15;
const GLYPH_RISE = 4;
```

Replace:

```ts
  private infusions: Infused[] = [];
```

with:

```ts
  private infusions: Infused[] = [];
  private glyphs: Glyph[] = [];
```

Replace:

```ts
    this.infusions = [];
  }
```

with:

```ts
    this.infusions = [];
    this.glyphs = [];
  }
```

Replace:

```ts
  /**
   * Advance and draw everything: the effects on the air layer, then the
   * infusion pass's first carriers (fx/infusion.ts) in priority order: heavy
   * and hold blows' rings, blasts, beams and sweeps, then blink trails. Only
   * blasts and blink trails lie on the ground, so only they get its layer.
   */
```

with:

```ts
  /**
   * A rune's glyph flashing at (x, y) for `GLYPH_LIFE`: `rows` of cells ('#'
   * lit), each a 2×2-pixel block, centred on the point; white at first, then
   * `color`, rising as it fades. It is drawn in the infusion pass, so its
   * cells come off the frame's budget.
   */
  glyph(x: number, y: number, rows: readonly string[], color: number): void {
    const cells = rows.join('').split('#').length - 1;
    this.glyphs.push({ x, y, rows, color, cells, age: 0 });
  }

  /**
   * Advance and draw everything: the effects on the air layer, then the
   * infusion pass's first carriers (fx/infusion.ts) in priority order: the
   * runes' glyphs, heavy and hold blows' rings, blasts, beams and sweeps,
   * then blink trails. Only blasts and blink trails lie on the ground, so
   * only they get its layer.
   */
```

Replace:

```ts
    // The infusion pass starts here, with these first-priority carriers.
    for (const f of this.infusions) f.age += dt;
```

with:

```ts
    // The infusion pass starts here, with these first-priority carriers: the runes' glyphs first,
    // each drawn whole while the budget covers its cells (else skipped that frame).
    for (const gl of this.glyphs) {
      gl.age += dt;
      if (gl.age >= GLYPH_LIFE || gl.cells > budget.left) continue;
      budget.left -= gl.cells;
      const p = gl.age / GLYPH_LIFE;
      // White as it flashes, then its colour, rising a whole pixel at a time as it fades.
      const color = p < GLYPH_WHITE ? 0xffffff : gl.color;
      const alpha = Math.min(1, 1.6 * (1 - p));
      const x0 = gl.x - gl.rows[0].length * PX;
      const y0 = gl.y - gl.rows.length * PX - Math.round(p * GLYPH_RISE) * PX;
      gl.rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++)
          if (row[i] === '#') px(g, x0 + 2 * i * PX, y0 + 2 * j * PX, color, alpha, 2);
      });
    }
    this.glyphs = this.glyphs.filter((gl) => gl.age < GLYPH_LIFE);
    for (const f of this.infusions) f.age += dt;
```

In `packages/client/src/features/delve/arena/ArenaRenderer.ts`:

Replace:

```ts
import { barrierBreakFx, reactionFx, reactionLabel } from './fx/reactions';
```

with:

```ts
import { barrierBreakFx, reactionFx, reactionLabel } from './fx/reactions';
import { runeFx } from './fx/runes';
```

Replace:

```ts
        case 'reaction':
          reactionFx(this.fx, e, w);
          break;
```

with:

```ts
        case 'reaction':
          reactionFx(this.fx, e, w);
          break;
        case 'runeFx':
          runeFx(this.fx, e);
          break;
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/runes.test.ts src/features/delve/arena/fx/__tests__/mana-fx.test.ts src/features/delve/arena/fx/__tests__/reactions.test.ts)`
Expected: PASS, 36 tests in 3 files (5 new; `mana-fx.test.ts`'s 22 and `reactions.test.ts`'s 9 unchanged).

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; every test passes: the count from "Before Task 1" plus 5, in one more file.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-arena-fx
(cd packages/client && npx prettier --write src/features/delve/arena/fx/runes.ts src/features/delve/arena/fx/__tests__/runes.test.ts src/features/delve/arena/fx/mana-fx.ts src/features/delve/arena/ArenaRenderer.ts)
git add packages/client/src/features/delve/arena/fx/runes.ts packages/client/src/features/delve/arena/fx/__tests__/runes.test.ts packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/ArenaRenderer.ts
git commit -m "feat(client): a rune's effect flashes its mana-pixel glyph in the arena" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: Runes on the floor

A rune drop is a stone in its family's colour with a notch per tier, named "✳️ Split III" above it in that colour; it lies still, sparkles in the colour when picked up, and has its own pickup sound. The item labels move into the same `dropLabel`, unchanged.

**Files:**
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts` (`makeDrop`, `syncDrops`, `pickupColor`, `dropLabel`, `drawDrop`)
- Modify: `packages/client/src/features/delve/arena/arena-sounds.ts`
- Modify: `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`
- Modify: `packages/client/src/features/delve/__tests__/arena-sounds.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`:

Replace:

```ts
import type { ArpgEvent, ArpgWorld, Drop } from '@alloy/engine';
import { drawDrop, dropPop, holdPing, pickupColor, pruneViews } from '../arena/ArenaRenderer';
import { MANA_HEX } from '../arena/palette';
```

with:

```ts
import type { ArpgEvent, ArpgWorld, Drop, GearItem } from '@alloy/engine';
import {
  drawDrop,
  dropLabel,
  dropPop,
  holdPing,
  pickupColor,
  pruneViews,
} from '../arena/ArenaRenderer';
import { MANA_HEX, RARITY_HEX } from '../arena/palette';
import { runeHex } from '../arena/fx/runes';
import { getDelveRegistry } from '../registry';
```

Append at the end of the file:

```ts
describe('runes on the floor', () => {
  const split = { id: 'split', tier: 3 as const };

  it('draw as a stone in their family colour, named with their tier, and sparkle so when picked up', () => {
    const stone = recorder();
    drawDrop(stone.g, drop({ kind: 'rune', rune: split }), 1, 1);
    expect(stone.fills).toContain(runeHex(split));
    expect(stone.fills).not.toContain(0xfcd34d); // not the scrap coin
    const def = getDelveRegistry().getRune('split');
    expect(dropLabel(drop({ kind: 'rune', rune: split }))).toEqual({
      text: `${def.icon} Split III`,
      color: runeHex(split),
    });
    expect(
      pickupColor({ kind: 'pickup', dropId: 1, dropKind: 'rune', amount: 0, rune: split }),
    ).toBe(runeHex(split));
  });

  it('names rare, epic and legendary items and runes, nothing else', () => {
    const item = (rarity: GearItem['rarity']) =>
      drop({ kind: 'item', item: { name: 'Sunfang', rarity } as GearItem });
    expect(dropLabel(item('legendary'))).toEqual({ text: 'Sunfang', color: RARITY_HEX.legendary });
    expect(dropLabel(item('magic'))).toBeNull();
    expect(dropLabel(drop({}))).toBeNull();
  });
});
```

In `packages/client/src/features/delve/__tests__/arena-sounds.test.ts`:

Append at the end of the file:

```ts
describe('rune sounds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a rune drops with the loot sound and is picked up with its own', () => {
    playArenaEvents([{ kind: 'drop', dropId: 1, x: 0, y: 0, dropKind: 'rune' }]);
    expect(playSound).toHaveBeenLastCalledWith('lootDrop');
    playArenaEvents([
      { kind: 'pickup', dropId: 1, dropKind: 'rune', amount: 0, rune: { id: 'split', tier: 3 } },
    ]);
    expect(playSound).toHaveBeenLastCalledWith('upgradeTier');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts src/features/delve/__tests__/arena-sounds.test.ts)`
Expected: FAIL, 3 tests of 12: the stone (`expected [ 16569165 ] to include …`: today a rune draws as the scrap coin, `0xfcd34d`), the names (`… .dropLabel) is not a function`: the export doesn't exist yet), and the sounds (`expected last "spy" call to have been called with [ 'lootDrop' ]`, the spy never called).

- [ ] **Step 3: The stone, its name and its sounds**

In `packages/client/src/features/delve/arena/ArenaRenderer.ts`:

Replace:

```ts
import { runeFx } from './fx/runes';
```

with:

```ts
import { TIER_NUMERAL, runeFx, runeHex } from './fx/runes';
```

Replace:

```ts
      // Items lie still, and so does a Seedling's rooted sprout.
      const still = d.kind === 'item' || isSprout(d);
```

with:

```ts
      // Items and runes lie still, and so does a Seedling's rooted sprout.
      const still = d.kind === 'item' || d.kind === 'rune' || isSprout(d);
```

Replace:

```ts
    let label: Text | null = null;
    const rarity = d.item?.rarity;
    if (d.item && (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary')) {
      label = new Text({
        text: d.item.name,
        style: {
          fontFamily: FONT,
          fontWeight: '700',
          fontSize: 13,
          fill: RARITY_HEX[rarity],
```

with:

```ts
    let label: Text | null = null;
    const named = dropLabel(d);
    if (named) {
      label = new Text({
        text: named.text,
        style: {
          fontFamily: FONT,
          fontWeight: '700',
          fontSize: 13,
          fill: named.color,
```

Replace:

```ts
/** A pickup's sparkle: the item's rarity, else the drop's mana (a mote, a Seedling orb), else red. */
export function pickupColor(e: Extract<ArpgEvent, { kind: 'pickup' }>): number {
  if (e.item) return RARITY_HEX[e.item.rarity];
```

with:

```ts
/**
 * A pickup's sparkle: the item's rarity, a rune's family, else the drop's
 * mana (a mote, a Seedling orb), else red.
 */
export function pickupColor(e: Extract<ArpgEvent, { kind: 'pickup' }>): number {
  if (e.item) return RARITY_HEX[e.item.rarity];
  if (e.rune) return runeHex(e.rune);
```

Replace:

```ts
  return Math.sin((age / 0.35) * Math.PI) * 1.1;
}
```

with:

```ts
  return Math.sin((age / 0.35) * Math.PI) * 1.1;
}

/**
 * The name floating over a drop: a rare, epic or legendary item's in its
 * rarity's colour, or a rune's glyph, name and tier ("✳️ Split III") in its
 * family's; null for anything else.
 */
export function dropLabel(d: Drop): { text: string; color: number } | null {
  const rarity = d.item?.rarity;
  if (d.item && (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary'))
    return { text: d.item.name, color: RARITY_HEX[rarity] };
  const def = d.rune ? getDelveRegistry().findRune(d.rune.id) : undefined;
  if (!d.rune || !def) return null;
  return {
    text: `${def.icon} ${def.name} ${TIER_NUMERAL[d.rune.tier - 1]}`,
    color: runeHex(d.rune),
  };
}
```

Replace:

```ts
  } else if (d.kind === 'orb') {
```

with:

```ts
  } else if (d.kind === 'rune' && d.rune) {
    // A rune stone in its family's colour, glowing, with a notch per tier (its name floats above).
    const color = runeHex(d.rune);
    const stone = [-0.2, -0.36, 0.2, -0.36, 0.26, -0.1, 0.2, 0.14, -0.2, 0.14, -0.26, -0.1];
    g.ellipse(0, 0.14, 0.3, 0.11).fill({ color: 0x000000, alpha: 0.4 });
    g.circle(0, -0.1, 0.46).fill({ color, alpha: 0.16 + Math.sin(time * 4 + d.id) * 0.06 });
    g.poly(stone).fill({ color: 0x1c1917 });
    g.poly(stone).stroke({ width: 0.05, color });
    for (let i = 0; i < d.rune.tier; i++)
      g.rect(-0.15 + i * 0.07, -0.16, 0.04, 0.1).fill({ color });
  } else if (d.kind === 'orb') {
```

In `packages/client/src/features/delve/arena/arena-sounds.ts`:

Replace:

```ts
        else if (ev.dropKind === 'item') playSound('lootDrop');
        break;
      case 'pickup':
        if (ev.dropKind === 'item') playSound('dropSuccess');
```

with:

```ts
        else if (ev.dropKind === 'item' || ev.dropKind === 'rune') playSound('lootDrop');
        break;
      case 'pickup':
        if (ev.dropKind === 'item') playSound('dropSuccess');
        else if (ev.dropKind === 'rune') playSound('upgradeTier');
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts src/features/delve/__tests__/arena-sounds.test.ts src/features/delve/arena/fx/__tests__/runes.test.ts)`
Expected: PASS, 17 tests in 3 files.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; every test passes: Task 1's count plus 3.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-arena-fx
(cd packages/client && npx prettier --write src/features/delve/arena/ArenaRenderer.ts src/features/delve/arena/arena-sounds.ts src/features/delve/__tests__/arena-renderer.test.ts src/features/delve/__tests__/arena-sounds.test.ts)
git add packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/arena-sounds.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts packages/client/src/features/delve/__tests__/arena-sounds.test.ts
git commit -m "feat(client): runes on the arena floor: a stone in its family colour, named with its tier, with its own pickup" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The HUD's rune dots, and the check

### Task 3: The HUD's rune dots

Each ability button shows one dot per rune acting on the move a press now casts, and the ⚔️ button one per rune on the blow that lands next, each in its family's colour, along the button's top edge; none without. The snapshot takes them from what the engine resolved, so a dormant rune (one that doesn't fit, a kind restriction, an Earth Bolt's extra Pierce) never shows.

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts` (the HUD snapshot only)
- Modify: `packages/client/src/features/delve/arena/ArenaHud.tsx`
- Modify: `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx`
- Modify: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx`:

Replace:

```tsx
import type { AbilityHud, ArenaHud } from '../arena/useArena';
```

with:

```tsx
import type { AbilityHud, ArenaHud } from '../arena/useArena';
import { getDelveRegistry } from '../registry';
import { FAMILY_STYLE } from '../runes/rune-style';

/** The first rune of a family in the data. */
const runeOf = (family: string) =>
  getDelveRegistry()
    .getRunes()
    .find((r) => r.family === family)!;
```

Replace:

```tsx
    basicHold: null,
    potions: 3,
```

with:

```tsx
    basicHold: null,
    basicRunes: [],
    potions: 3,
```

Replace:

```tsx
  affordable: true,
  ready: true,
};
```

with:

```tsx
  affordable: true,
  ready: true,
  runes: [],
};
```

Replace:

```tsx
  it("hides the button of a skill the weapon doesn't carry; the others keep their slots", () => {
```

with:

```tsx
  it("shows a dot per rune acting on the next move, in its family's colour; none without", () => {
    const shape = runeOf('shape');
    const sustain = runeOf('sustain');
    const runes = [
      { id: shape.id, tier: 3 as const },
      { id: sustain.id, tier: 1 as const },
    ];
    render(bar({ abilities: [{ ...BOLT, runes }, BOLT] }));
    const dots = [...screen.getByTestId('ability-0').querySelectorAll('[data-rune]')];
    expect(dots.map((d) => d.getAttribute('data-rune'))).toEqual([shape.id, sustain.id]);
    expect(dots[0]).toHaveStyle({ background: FAMILY_STYLE.shape.color });
    expect(dots[1]).toHaveStyle({ background: FAMILY_STYLE.sustain.color });
    expect(screen.getByTestId('ability-1').querySelector('[data-rune]')).toBeNull();
  });

  it("hides the button of a skill the weapon doesn't carry; the others keep their slots", () => {
```

Append at the end of the file:

```tsx
describe('AttackButton runes', () => {
  it('shows a dot per rune acting on the next blow; none without', () => {
    const tempo = runeOf('tempo');
    const { rerender } = render(
      <AttackButton hud={hud({ basicRunes: [{ id: tempo.id, tier: 2 }] })} onAttack={() => {}} />,
    );
    const button = screen.getByTestId('attack-button');
    expect(button.querySelectorAll('[data-rune]')).toHaveLength(1);
    expect(button.querySelector('[data-rune]')).toHaveStyle({
      background: FAMILY_STYLE.tempo.color,
    });
    rerender(<AttackButton hud={hud()} onAttack={() => {}} />);
    expect(button.querySelector('[data-rune]')).toBeNull();
  });
});
```

In `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`:

Append at the end of the file:

```ts
describe('arena HUD snapshot: runes', () => {
  /** A rune's id by its name in the data. */
  const idOf = (name: string) => registry.getRunes().find((r) => r.name === name)!.id;

  it('carries the runes acting on each next move and on the next blow, never a dormant one', () => {
    const split = { id: idOf('Split'), tier: 3 as const };
    const widen = { id: idOf('Widen'), tier: 1 as const }; // doesn't fit a Bolt
    const chain = { id: idOf('Chain'), tier: 2 as const };
    const w = sandbox({
      primary: {
        moves: [{ kind: 'light', form: 'bolt', elements: ['fire'], runes: [split, widen, null] }],
        payment: 'mana',
      },
    });
    let hud = snapshot(w);
    expect(hud.abilities[0]!.runes).toEqual([split]);
    expect(hud.abilities[2]!.runes).toEqual([]);
    expect(hud.basicRunes).toEqual([]);
    // A sword's blow: Chain fits every weapon, Split only a bow's or a wand's.
    const weapon = sandboxWeapon(registry, {
      baseId: 'sword',
      mana: 'fire',
      rarity: 'common',
      ilvl: 5,
    });
    w.hero.stats = computeHeroStats({ weapon }, registry, {
      basic: [{ kind: 'light', element: 'fire', runes: [chain, split] }],
    });
    hud = snapshot(w);
    expect(hud.basicRunes).toEqual([chain]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ArenaHud.test.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts)`
Expected: FAIL, 3 tests of 26: the ability dots (`expected [] to deeply equal [ 'split', … ]`), the ⚔️ dots (`expected NodeList [] to have a length of 1 but got +0`), and the snapshot (`expected undefined to deeply equal [ { id: 'split', tier: 3 } ]`).

- [ ] **Step 3: The snapshot and the dots**

In `packages/client/src/features/delve/arena/useArenaCore.ts`:

Replace:

```ts
  type ResolvedAbility,
  type Vec,
} from '@alloy/engine';
```

with:

```ts
  type ResolvedAbility,
  type RuneRef,
  type Vec,
} from '@alloy/engine';
```

Replace:

```ts
  affordable: boolean;
  ready: boolean;
}
```

with:

```ts
  affordable: boolean;
  ready: boolean;
  /** The runes acting on the move a press now casts (`pressMove`), in socket order. */
  runes: RuneRef[];
}
```

Replace:

```ts
  basicHold: { charge: number; stage: number } | null;
```

with:

```ts
  basicHold: { charge: number; stage: number } | null;
  /** The runes acting on the blow that lands next, in socket order. */
  basicRunes: RuneRef[];
```

Replace:

```ts
        ready: cooldown <= 0 && charged && affordable && !busy,
```

with:

```ts
        ready: cooldown <= 0 && charged && affordable && !busy,
        runes: pressMove(h, i, t, comboWindow)?.runes ?? [],
```

Replace:

```ts
    basicHold: held !== null ? holdCharge(bal, held, t, holdFull(bal, h.stats.tempo)) : null,
```

with:

```ts
    basicHold: held !== null ? holdCharge(bal, held, t, holdFull(bal, h.stats.tempo)) : null,
    basicRunes: h.stats.weapon.blows[blow].runes,
```

In `packages/client/src/features/delve/arena/ArenaHud.tsx`:

Replace:

```tsx
import type { BiomeDef, DiveState, Vec } from '@alloy/engine';
```

with:

```tsx
import type { BiomeDef, DiveState, RuneRef, Vec } from '@alloy/engine';
```

Replace:

```tsx
import { KIND_ICON, moveText } from '../chains/chain-text';
```

with:

```tsx
import { KIND_ICON, moveText } from '../chains/chain-text';
import { FAMILY_STYLE } from '../runes/rune-style';
```

Replace:

```tsx
/**
 * A press on an ability button: its slot and pointer, where and when it
```

with:

```tsx
/**
 * The runes acting on the next move (or blow): a dot each in its family's
 * colour along the button's top edge (`data-rune`: its id); none without.
 */
function RunePips({ runes }: { runes: readonly RuneRef[] }) {
  if (runes.length === 0) return null;
  const registry = getDelveRegistry();
  return (
    <span
      className="pointer-events-none absolute -top-1 left-1/2 flex -translate-x-1/2 gap-0.5"
      aria-hidden
    >
      {runes.map((r, k) => (
        <span
          key={k}
          data-rune={r.id}
          className="h-1.5 w-1.5 rounded-full ring-1 ring-black/70"
          style={{ background: FAMILY_STYLE[registry.getRune(r.id).family].color }}
        />
      ))}
    </span>
  );
}

/**
 * A press on an ability button: its slot and pointer, where and when it
```

Replace:

```tsx
      <ChainDots step={ab.chainStep} length={ab.chainLength} color={color} />
```

with:

```tsx
      <ChainDots step={ab.chainStep} length={ab.chainLength} color={color} />
      <RunePips runes={ab.runes} />
```

Replace:

```tsx
      {hud && <ChainDots step={hud.basicChainStep} length={hud.basicChainLength} color="#fde047" />}
```

with:

```tsx
      {hud && <ChainDots step={hud.basicChainStep} length={hud.basicChainLength} color="#fde047" />}
      {hud && <RunePips runes={hud.basicRunes} />}
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ArenaHud.test.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts)`
Expected: PASS, 26 tests in 2 files.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; every test passes: the count from "Before Task 1" plus 11, in one more file.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-arena-fx
(cd packages/client && npx prettier --write src/features/delve/arena/useArenaCore.ts src/features/delve/arena/ArenaHud.tsx src/features/delve/__tests__/ArenaHud.test.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts)
git add packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/ArenaHud.tsx packages/client/src/features/delve/__tests__/ArenaHud.test.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts
git commit -m "feat(client): rune dots on the HUD's ability buttons and the attack button, by family colour" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Verification and the browser check

No commit: this task checks the area.

- [ ] **Step 1: The whole client, its build and the formatting**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run) && (pnpm -F @alloy/client build)`
Expected: no type errors; every test passes (the count from "Before Task 1" plus 11, in one more file); the build succeeds (Vite's warning about chunks over 500 kB is expected).

Run: `(cd packages/client && npx prettier --check src/features/delve/arena/fx/runes.ts src/features/delve/arena/fx/__tests__/runes.test.ts src/features/delve/arena/fx/mana-fx.ts src/features/delve/arena/ArenaRenderer.ts src/features/delve/arena/arena-sounds.ts src/features/delve/arena/useArenaCore.ts src/features/delve/arena/ArenaHud.tsx src/features/delve/__tests__/arena-renderer.test.ts src/features/delve/__tests__/arena-sounds.test.ts src/features/delve/__tests__/ArenaHud.test.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts)`
Expected: "All matched files use Prettier code style!"

Run: `git diff --stat <base> HEAD -- packages/engine`
Expected: nothing: this area changes no engine file, so the no-rune determinism check (the DPS Lab grid, the pacing rails, the items hash) has nothing to re-measure here.

- [ ] **Step 2: The rune ids for the seeded loadout**

Run: `node -e "console.log(require('./packages/engine/src/data/runes.json').map((r) => r.id + ' ' + r.name).join(', '))"`
Expected: 14 runes, among them `split Split`, `echo Echo` and `volatile Volatile`. If an id differs, use the printed one in Step 3's seed.

- [ ] **Step 3: The Training Grounds with socketed moves**

Run the PowerShell block under "Dev server on 5291"; expect `True`. Then, with the Playwright MCP tools (`mcp__plugin_playwright_playwright__*`):

1. `browser_navigate` to `http://localhost:5291/delve`.
2. `browser_evaluate` this function, which seeds the sandbox's saved loadout (a legendary Fire wand, whose blows take Split and Echo; a Primary of a Fire Bolt holding Split and Echo then a Frost Bolt holding Volatile, so the second Bolt melts the first's stacks; a row of dummies; infinite mana, no cooldowns, invulnerable) and mutes the sound:

   ```js
   () => {
     localStorage.setItem('alloy:muted', 'true');
     localStorage.setItem(
       'alloy:delve:sandbox:v1',
       JSON.stringify({
         weapon: { baseId: 'wand', mana: 'fire', rarity: 'legendary' },
         chains: {
           basic: [
             { kind: 'light', element: 'fire', runes: [{ id: 'split', tier: 3 }] },
             { kind: 'heavy', element: 'fire', runes: [{ id: 'echo', tier: 3 }] },
           ],
           primary: {
             moves: [
               { kind: 'medium', form: 'bolt', elements: ['fire'], runes: [{ id: 'split', tier: 3 }, { id: 'echo', tier: 3 }, null] },
               { kind: 'medium', form: 'bolt', elements: ['frost'], runes: [{ id: 'volatile', tier: 3 }] },
             ],
             payment: 'mana',
           },
           defensive: { moves: [{ kind: 'medium', form: 'ward', elements: ['frost'] }], payment: 'mana' },
           ultimate: { moves: [{ kind: 'heavy', form: 'nova', elements: ['fire'] }], payment: 'mana' },
         },
         dummies: [{ layout: 'row', element: null }],
         toggles: { infiniteMana: true, noCooldowns: true, invulnerable: true },
       }),
     );
     return localStorage.getItem('alloy:delve:sandbox:v1') !== null;
   }
   ```

   Expected: `true`.
3. `browser_navigate` to `http://localhost:5291/delve/training`, then `browser_wait_for` the text "Primary" or wait until `[data-testid="ability-0"]` shows (up to 30 s: Pixi and the sprites load).
4. `browser_evaluate` `() => [...document.querySelectorAll('[data-testid="ability-0"] [data-rune]')].map((d) => d.getAttribute('data-rune'))`.
   Expected: `["split", "echo"]` (the first Bolt's runes; the empty socket shows nothing). If it is `[]`, the loadout fell back to the defaults: check that `sandboxStore` kept the seeded chains (`JSON.parse(localStorage.getItem('alloy:delve:sandbox:v1')).chains.primary.moves[0].runes`).
5. Close the Training panel if it covers the arena as a sheet (`training-panel-close`; docked on desktop, it stays). `browser_press_key` `q`, wait 300 ms, `q` again; then at once `browser_take_screenshot` (save it as `runes-arena-1.png` in the scratchpad), and again 150 ms later (`runes-arena-2.png`).
   Look for: the Bolts and the wand's shots shedding small shard orbs where they hit; small 5×5 pixel glyphs (an X for Split, two arcs for Echo, a diamond spark for Volatile) flashing white then cyan, amber or violet a unit above the dummies or the hero, rising as they fade; "MELT!" floating when the Frost Bolt lands on the Fire stacks; and the ability button's dots. Glyph flashes last 0.45 s, so take a few more screenshots while pressing `q` if the first two miss them.
6. `browser_evaluate` the same query as in 4. Expected: `["volatile"]` within the combo window after the first press lands (the next press is the Frost Bolt), back to `["split", "echo"]` after it.
7. `browser_console_messages` with level `error`. Expected: none. A WebGL or `getContext` warning is not an error; any `TypeError` or React key warning is a bug to fix before reporting.
8. The ⚔️ button shows only with manual attacks on a touch screen (`DelveTraining.tsx`: `manualAttack && (!fineMouse || device === 'gamepad')`), which the desktop browser isn't; Task 3's tests cover its dots. A rune on the floor needs a dive (the sandbox drops none); Task 2's tests cover it, and wave 3's E2E dives with the autopilot.

Then stop the server: `try { $ids = (Get-NetTCPConnection -LocalPort 5291 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}` (PowerShell), and `browser_close`.

- [ ] **Step 4: Report**

Report to the controller: the three commits, the client's test count and typecheck, the build, the screenshots' paths with what each shows (shards, glyphs, dots, MELT), the console's errors (none expected), and that a melee blow's echo shows no swing smear (Cross-area needs, 2: the controller's call).
