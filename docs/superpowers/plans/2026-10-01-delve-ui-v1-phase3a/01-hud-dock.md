# Delve UI v1 · Phase 3a · 3A: HUD dock and top bar — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dive HUD's frame, top bar and dock (v0.56.0): `HudGrid` (the `.delve-ui.delve-hud-zoom` grid that reports the camera's four insets), `PurseBar` (the glass top bar: purse, "+N banks on extract", Labels, Journal, Menu), and the Hades-style `SkillDock` (Q/E/R as 76 px steel slots with name, chain step, cost and a glass tooltip; Dodge, Potion and an Attack slot in both modes; buff tiles; the long life and mana bars), with `BossBar` and `floatPay` moved to `arena/hud/`. `DelveRun` composes the grid with 3B's `FloorColumn`; `DelveTraining` gets the minimal port (the grid and the dock, today's top-bar contents in a glass bar, today's docked panel in the right column at its own size). `ArenaHud.tsx` shrinks to a re-export of `floatPay` until the integrator moves its last import.

**Architecture:** View only, in `packages/client/src/features/delve/arena/hud/`. `HudGrid` is a sibling of the arena host inside the unzoomed page root, so the canvas never has a zoomed ancestor (decided item 31); it measures its parts with `getBoundingClientRect` (viewport px) on mount, on a `ResizeObserver`, on window resize and on a HUD scale change, and calls `onInsets` only when they change. `SkillDock` reads nothing but the snapshot (`ArenaHud`), the player's bindings (`controlsStore`, drawn by the kit's `InputGlyph` for the locked device) and, for the tooltip's numbers, the fight's world (`worldRef`: the hero's resolved chain through `chains/MoveEditor`'s `moveRows`, i.e. `moveNumbers` and `moveBeat`). No touch or drag code: a click on a slot casts it auto-aimed (decided item 8), so `ArenaHud.tsx` stops importing `aim-gestures.ts`. No engine change, no store change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md` — "Phase 3 → 3a" (The HUD grid, Purse bar, Skill dock, the contract `HudGridProps` / `SkillDockProps` / `HudBuff`, "Parallel areas in 3a", "Sequencing in 3a", "E2E in 3a"); decided items 8, 27, 29, 30, 31, 33, 35, 38; "The input map" (Pause, Journal, Show all loot labels); Appendix A (slot, glyph, buff, life, mana). Mockup: the Dive HUD board (`Arena-HUD.dc.html`). Overview: `00-overview.md` in this folder.

---

## Base

- **Tasks 1–4** start from branch `ui/p3a` (= `ui/p2` after its review fixes, v0.55.0), in this area's worktree `C:/Projects/alloy-ui-p3a-3a` on branch `ui/p3a-3a` (`scratchpad/mkwt.ps1 alloy-ui-p3a-3a ui/p3a-3a ui/p3a`; it junctions `node_modules` and points the client's `@alloy/engine` at the worktree's own engine). Every path below is relative to the worktree root, `/c/Projects/alloy-ui-p3a-3a` in Git Bash.
- **Task 5** runs on `ui/p3a` itself (worktree `C:/Projects/alloy-ui-p3a`, so its commit block `cd`s there) **after 3A's Tasks 1–4 and 3B have merged and before 3C merges**, as Phase 2's 2C Task 7 ran on `ui/p2` after 2A: it composes 3B's `FloorColumn` (which must exist), and it rewrites `DelveRun`'s `insets` state before 3C narrows `useArena`'s option to `Insets`. Nothing in Tasks 1–4 needs another area.
- **What must merge first:** nothing for Tasks 1–4. Task 5: 3B (`arena/hud/FloorColumn.tsx` with the spec's `FloorColumnProps`).
- **Anchors** are in `pages/DelveRun.tsx`, `pages/DelveTraining.tsx`, `pages/__tests__/DelveTraining.test.tsx`, `features/delve/arena/ArenaHud.tsx` and `features/delve/__tests__/ArenaHud.test.tsx`, none of which the Phase 2 review fixes (hub, items, `ItemTile.tsx`, `hero-stats.ts`, kit bits) touch. Checked against `ui/p2` at `1014acc` (the review fixes so far) and `895fb0a`.
- **Before Task 1:** build the engine once for the junction and measure the client:

```bash
cd /c/Projects/alloy-ui-p3a-3a
(cd packages/engine && npx tsup)
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
```

  Expected: tsup's "Build success" lines; the suite passes and the typecheck prints nothing. `ui/p2` at `1014acc` reads **1096 tests in 139 files**. Call the measured counts **N tests in F files**. Tasks 1–4 end at **N + 6 tests in F + 1 files**; Task 5 adds 2 tests in 1 file on `ui/p3a`.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/arena/hud/floatPay.ts` (new) | `floatPay`, moved from `ArenaHud.tsx`: a skill's spend floating from its slot (`ability-<slot>`), "−16" in mana colour or "−78 charge" (no emoji) |
| `packages/client/src/features/delve/arena/hud/Vitals.tsx` (new) | the life bar (`hero-hp`, 32 px green planks, `hp-barrier` pale segment, "226 / 289 · barrier 34") and the mana bar (`mana-bar`, 24 px, "74 / 102", aria "Mana N of M") |
| `packages/client/src/features/delve/arena/hud/BossBar.tsx` (new) | moved from `ArenaHud.tsx`: a `HudGrid` child under the top bar, centred in the middle column, only while a boss lives (`boss-bar`) |
| `packages/client/src/features/delve/arena/hud/BuffRow.tsx` (new) | `HudBuff` (the spec's type) and the 38 px buff tiles, glyph and seconds left |
| `packages/client/src/features/delve/arena/hud/SkillSlot.tsx` (new) | the 76 px Q/E/R slot (`ability-<slot>`): form glyph, bound input, rune dots, cooldown fill with seconds (beat without), hold tick bar, Galvanize's spark; click casts; plus `SLOT_STYLE`, `noFocus`, `BoundGlyph`, `RuneDots`, `TickBar` for the dock |
| `packages/client/src/features/delve/arena/hud/SkillTooltip.tsx` (new) | the glass tooltip card: name, "move n of m · kind", Hit / Cost / Beat after from `moveRows`, the runes |
| `packages/client/src/features/delve/arena/hud/SkillDock.tsx` (new) | `SkillDockProps` (the spec's, plus an optional `world`) and the dock (`skill-bar`): skill rows with tooltips, Dodge (`dodge-button`), Potion (`potion-button`), Attack (`attack-button`, `data-mode`), `BuffRow`, `Vitals` |
| `packages/client/src/features/delve/arena/hud/HudGrid.tsx` (new) | `Insets`, `HudGridProps` (the spec's, plus `children`) and the grid; reports the insets |
| `packages/client/src/features/delve/arena/hud/PurseBar.tsx` (new) | the glass top bar: purse, `bounty`, Labels hint, Journal (`data-pad-journal`), Menu ("Dive menu", `data-pad-menu`); `LABELS_BINDING` |
| `packages/client/src/features/delve/arena/ArenaHud.tsx` | Task 1: its `floatPay` becomes a re-export of `hud/floatPay`. Task 5: only that re-export is left (`TopHud`, `SkillBar`, `AbilityButton`, `AttackButton`, `DodgeButton`, `ChainDots`, `HoldBar`, `RunePips`, `Vitals`, `BossBar`, `keyHints`, `padHints` and the `aim-gestures` import go) |
| `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx` | rewritten for the new HUD: bars, boss bar, buffs, the floating spend (Task 1); the dock (Task 2) |
| `packages/client/src/features/delve/__tests__/HudGrid.test.tsx` (new) | the insets; the purse |
| `packages/client/src/pages/DelveTraining.tsx` | the minimal port (Task 4) |
| `packages/client/src/pages/__tests__/DelveTraining.test.tsx` | + the panel, dock and top bar on the grid |
| `packages/client/src/pages/DelveRun.tsx` | `HudGrid` with `PurseBar`, `FloorColumn` and `SkillDock`, `BossBar` on the grid; the banners' hard shadow (Task 5) |
| `packages/client/src/pages/__tests__/DelveRun.test.tsx` (new) | the grid around the arena host; Menu opens and never closes the menu (Task 5) |

Nothing else changes: no kit, store, engine, arena-core or right-column file. The version bump (0.56.0) is the integrator's.

## Cross-area needs

No edit in another area's files. For the integrator, in order:

1. **Merge order:** 3A (Tasks 1–4) → 3B → 3A Task 5 on `ui/p3a` → 3C → 3C's deferred `aim-gestures.ts` deletion and the edits below → E2E. 3B deletes `arena/PickupFeed.tsx`, which `DelveRun.tsx` imports until Task 5: if 3B's deletion lands before Task 5, `ui/p3a` fails its typecheck only until Task 5 (or 3B keeps the file and deletes it after Task 5).
2. **After 3C (the `floatPay` import, spec "Sequencing in 3a"):** in `packages/client/src/features/delve/arena/useArenaCore.ts` replace `import { floatPay } from './ArenaHud';` with `import { floatPay } from './hud/floatPay';`, then delete `packages/client/src/features/delve/arena/ArenaHud.tsx` (only that re-export is left). `ArenaHud.test.tsx` already imports from `arena/hud/` and stays.
3. **After 3C (one type each):** in `arena/hud/HudGrid.tsx` replace the `Insets` interface (from `/** The camera's insets, in viewport px (the spec's contract; 3C's renderer takes them). */` through its closing `}`) with `export type { Insets } from '../camera';`; in `arena/hud/BuffRow.tsx` replace the `HudBuff` interface (its doc comment through its closing `}`) with `import type { HudBuff } from '../useArenaCore';` plus `export type { HudBuff };`; in `arena/hud/SkillDock.tsx` replace the two lines ``// 3C's snapshot adds `buffs`; until it does, there are none.`` and `const buffs = (hud as (ArenaHud & { buffs?: HudBuff[] }) | null)?.buffs ?? [];` with `const buffs = hud?.buffs ?? [];`, and drop `type HudBuff` from its `./BuffRow` import. Until then the shapes are identical and both compile.
4. **After 3C (the rebindable hints, decided item 23):** in `arena/hud/PurseBar.tsx`, the Labels and Journal glyphs show the player's binding: replace `<InputGlyph binding={LABELS_BINDING} size="sm" />` with `<InputGlyph binding={{ key: config.keys.labels ?? undefined, pad: config.pad.labels ?? undefined, whileHeld: true }} size="sm" />`, replace `<InputGlyph binding={JOURNAL_BINDING} size="sm" />` with `<InputGlyph binding={{ key: config.keys.journal ?? undefined, pad: config.pad.journal ?? undefined }} size="sm" />`, and delete `LABELS_BINDING` and the `JOURNAL_BINDING` import.
5. **What 3A codes against.** 3C: `useArena` / `useTrainingArena` options take the 4-side `Insets` (an object with `top` and `bottom` satisfies today's type, so the pages compile before and after 3C); the arena's `worldRef`, `cast(slot)`, `dodge()`, `potion()` and `attack(held)` are as today; the `journal` action clicks `scopedLast('[data-pad-journal]')` (the purse's Journal, disabled until 3b wires `onJournal`) and the menu key `scopedLast('[data-pad-menu]')` (the purse's Menu). 3B: `FloorColumn` takes the spec's `FloorColumnProps` and sets `pointer-events: auto` on its own panels (the grid is `none`); the right column wrapper is `flex min-h-0 flex-col gap-4`.

## Where the spec left room

- **Two contract additions, both optional:** `SkillDockProps.world` (the fight's `worldRef`: the tooltip's numbers need the hero's resolved chain and stats, which the snapshot doesn't carry) and `HudGridProps.children` (laid on the grid itself: the `BossBar`, at column 2, row 2, top, centred, as decided item 29 places it).
- **"While the slot's own button is held":** the snapshot's only held-button signal is a charging hold (`AbilityHud.hold`, set only while its button is held, by key or pad), so the tooltip opens on hover, on focus, or while its hold charges. A non-hold move casts on press.
- **Tooltip place:** the kit `Tooltip` (`placement="right"`, `portal={false}`) on the row (`self-start`, 358 px wide) puts the card 12 px past it, at 370 design px (the mockup's 380); it measures, flips and clamps itself.
- **The purse at 1280×720:** the HUD's floor scale (0.75) leaves the bar 1302 design px, and the mockup's resource names overflow it (measured). Each resource is its glyph (named "Scrap", "Links", "Mana Dust", "Runes", "Items" for screen readers), the amount held and this dive's gain, as the spec's "Price-style glyph" reads; "Purse" and "+N banks on extract" stay.
- **Journal** is a real button carrying `data-pad-journal` (the arena's `journal` action clicks it) and disabled until there is an `onJournal` (3b's pause on Quests). **Labels** is a hint only (a hold has nothing to click). **Menu** calls `onMenu`; `DelveRun` passes "open", never a toggle.
- **The cost line:** "N mana", "N mana · cast", "charge N%", in mana cyan (charge in secondary text), amber (`--k-hot`) when unaffordable. **The chain-step bar:** the moves played this pass in the element's colour, the next white, the rest steel.
- **The cooldown fill** covers the slot's remaining fraction from the bottom (the mockup's dark gradient), with its seconds for a cooldown and none for a beat; it glides 80 ms between refreshes while it empties and snaps when it rises, as today's sweep did (now a `height` transition, so the registered `--delve-sweep` property is no longer used by the HUD). A channel's progress keeps a bar like the hold's, without ticks.
- **The Attack slot:** in Auto it reads "Auto", dimmed, no glyph, and a click does nothing; in Manual it shows the attack glyph and the bound input, and a click is one tap (`attack(true)` then `attack(false)`). Both modes keep today's rune dots and a held blow's charge bar.
- **Dodge:** its two pips sit at the slot's top (the bound "Space" keycap covers the bottom), the next one filling with the refill; the border turns `#fee761` while the riposte is armed (`data-riposte`).
- **Colours:** buff tiles Riposte `#fee761`, Quick `#feae34`, Barrier `#ead4aa` (the barrier segment's); the boss bar's planks `#e43b44` / `#a22633`; the floating spend mana `#2ce8f5`, charge `#fee761`. All ENDESGA / kit values.
- **Vitals** draws its bars with the kit's bar classes (`k-bar`, `k-lifeframe`, `k-mana`, `k-bar-fill`, `k-bar-label`) rather than `Bar`: `hp-barrier` must sit on the segment (no test id on a kit internal), the barrier shows over the life's end at full life (`Bar`'s `extra` hides there), and G04 reads `mana-bar`'s "Mana N of M" label.
- **The dive's dock** hides while choosing a door or on the summary, as today's bottom strip did; the purse and the right column stay (D01 reads `bounty` at the door).
- **Banners (decided item 29):** the hard 2 px `#181425` shadow replaces the glow; they keep 26% from the top.
- **Training (decided items 6, 38):** the sheet layout stays for narrow windows (T03) until 3F; only the docked panel moves into the right column, under `zoom: calc(1 / var(--hud-scale))`. It is 360 px in a 340-design-px column, so at HUD scale 1 it overhangs the 16 px gap by 20 px (accepted until 3F's 400 px dock). The top bar keeps today's contents and markers (`training-back`, `meter-chip`, Panel with `data-pad-menu`, their `◂`/`☰`) in a glass bar, for 3F to rebuild; the arena host no longer narrows beside the panel (the insets carry the right column from 3C on).

## Conventions

The overview's shared conventions (Phase 2's): one commit per task, staged by path, never `git add -A`; the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` as the last `-m`; don't push or merge. Every command runs from the worktree root in a subshell.
- **Line endings:** a fresh worktree checks out CRLF; new files are written LF. Prettier runs as `npx prettier --end-of-line auto`, so it keeps each file's endings. Every file this plan edits passes `npx prettier --end-of-line auto --check` at the base, and the code below is already formatted (checked on the scratch copy), so each commit block's `--write` changes nothing typed as written.
- **How the edits read:** the 4a edit language. "Replace: A with: B" is one Edit. "Replace the lines from `A` up to (not including) `B` with: C" replaces from the line that reads `A` (ignoring indentation) to the line before the one that reads `B`; "…up to the end of the file" runs to the last line. "Append at the end of the file:" adds a blank line and the block. "Create `f`:" is a Write. Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **Checked on a scratch copy** of `ui/p2` at `1014acc` (engine built, `node_modules` junctioned): each task's FAIL and PASS below was run, the edits applied in order with the 4a applier (`scratchpad/runes/w0/apply.mjs`), and Task 5 against a stand-in `FloorColumn` with the spec's props (3B's draft `FloorColumn` has the same props). The whole client went 1096 → 1104 tests and 139 → 141 files with the typecheck clean, every edited file came out byte-identical to the scratch copy's, and the dive and the Training Grounds were screenshotted at 1920×1080 and 1280×720 (the canvas host has no zoomed ancestor).

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: The bars, the boss bar, the buffs and the floating spend

### Task 1: `Vitals`, `BossBar`, `BuffRow` and `floatPay` in `arena/hud/`

The leaf pieces of the dock, in the forge kit's look. `floatPay` moves (it still finds `[data-testid="ability-N"]`), and `ArenaHud.tsx` re-exports it so `useArenaCore` (3C's) keeps its import. `ArenaHud.test.tsx` is rewritten for the new HUD; today's buttons stay in `ArenaHud.tsx`, unused by tests, until Task 5 deletes them with their last user.

**Files:**
- Create: `packages/client/src/features/delve/arena/hud/floatPay.ts`
- Create: `packages/client/src/features/delve/arena/hud/Vitals.tsx`
- Create: `packages/client/src/features/delve/arena/hud/BossBar.tsx`
- Create: `packages/client/src/features/delve/arena/hud/BuffRow.tsx`
- Modify: `packages/client/src/features/delve/arena/ArenaHud.tsx`
- Modify: `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx`:

Replace the lines from `import { describe, it, expect, vi } from 'vitest';` up to the end of the file with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { floatPay } from '../arena/hud/floatPay';
import { Vitals } from '../arena/hud/Vitals';
import { BossBar } from '../arena/hud/BossBar';
import { BuffRow, type HudBuff } from '../arena/hud/BuffRow';
import type { ArenaHud } from '../arena/useArena';

/** A HUD snapshot (cast: 3C's snapshot adds `buffs` and `map`). */
function hud(over: Partial<ArenaHud> & { buffs?: HudBuff[] } = {}): ArenaHud {
  return {
    hp: 100,
    maxHp: 100,
    mana: 50,
    manaMax: 60,
    abilities: [],
    busy: false,
    dodgeCharges: 1,
    dodgeMax: 2,
    dodgeRefill: 0.4,
    riposte: false,
    basicChainStep: 1,
    basicChainLength: 3,
    basicNextKind: 'light',
    basicHold: null,
    basicRunes: [],
    potions: 3,
    monstersLeft: 5,
    monstersTotal: 8,
    boss: null,
    cleared: false,
    barrier: null,
    galvanizedAt: null,
    t: 10,
    ...over,
  } as ArenaHud;
}

describe('the life and mana bars', () => {
  it("shows Obsidian's barrier as a pale segment after the life (over its end at full life), and in the label", () => {
    const { rerender } = render(<Vitals hud={hud({ hp: 50, barrier: { hp: 20, max: 30 } })} />);
    const seg = screen.getByTestId('hp-barrier');
    expect(seg.style.left).toBe('50%');
    expect(seg.style.width).toBe('20%');
    expect(screen.getByTestId('hero-hp')).toHaveTextContent('50 / 100 · barrier 20');
    rerender(<Vitals hud={hud({ hp: 100, barrier: { hp: 20, max: 30 } })} />);
    expect(screen.getByTestId('hp-barrier').style.left).toBe('80%');
    rerender(<Vitals hud={hud()} />);
    expect(screen.queryByTestId('hp-barrier')).toBeNull();
    expect(screen.getByTestId('hero-hp')).toHaveTextContent(/^100 \/ 100$/);
  });

  it('writes the mana bar as current / max, whole numbers, keeping its label', () => {
    render(<Vitals hud={hud({ mana: 37.8, manaMax: 60.4 })} />);
    const bar = screen.getByTestId('mana-bar');
    expect(bar).toHaveTextContent('37 / 60');
    expect(bar).toHaveAttribute('aria-label', 'Mana 37 of 60');
  });
});

describe('the boss bar', () => {
  it('shows only while a boss lives, with its life', () => {
    const { rerender } = render(<BossBar hud={hud()} />);
    expect(screen.queryByTestId('boss-bar')).toBeNull();
    rerender(<BossBar hud={hud({ boss: { name: 'Grask', icon: '☠', hp: 40, maxHp: 160 } })} />);
    expect(screen.getByTestId('boss-bar')).toHaveTextContent('Grask');
    expect(screen.getByTestId('boss-bar')).toHaveTextContent('40 / 160');
  });
});

describe('the buff tiles', () => {
  it('draws a tile per buff with its seconds left; none without', () => {
    const { container, rerender } = render(
      <BuffRow
        buffs={[
          { id: 'riposte', left: 0.6, total: 1 },
          { id: 'quick', left: 3.2, total: 4 },
        ]}
      />,
    );
    const tiles = [...container.querySelectorAll('[data-buff]')];
    expect(tiles.map((t) => t.getAttribute('data-buff'))).toEqual(['riposte', 'quick']);
    expect(tiles.map((t) => t.textContent)).toEqual(['1s', '4s']);
    expect(screen.getByRole('img', { name: 'Quick, 4s left' })).toBe(tiles[1]);
    rerender(<BuffRow buffs={[]} />);
    expect(container.querySelector('[data-buff]')).toBeNull();
  });
});

describe('the floating spend', () => {
  it("floats each skill's spend from its own slot: mana, then charge, rounded; nothing for 0", () => {
    const original = Element.prototype.animate;
    const anims: { onfinish: (() => void) | null }[] = [];
    Element.prototype.animate = vi.fn(() => {
      const a = { onfinish: null as (() => void) | null };
      anims.push(a);
      return a as unknown as Animation;
    });
    render(
      <>
        {[0, 1, 2].map((s) => (
          <button key={s} type="button" data-testid={`ability-${s}`} />
        ))}
      </>,
    );
    const floats = (slot: number) =>
      [...screen.getByTestId(`ability-${slot}`).querySelectorAll('[data-pay]')] as HTMLElement[];

    floatPay({ kind: 'pay', slot: 0, mana: 16.4, charge: 0 });
    expect(floats(0).map((f) => f.textContent)).toEqual(['−16']);
    expect(floats(1)).toEqual([]);
    floatPay({ kind: 'pay', slot: 2, mana: 0, charge: 78.2 });
    expect(floats(2).map((f) => f.textContent)).toEqual(['−78 charge']);
    expect(floats(0)[0].style.color).not.toBe(floats(2)[0].style.color);

    floatPay({ kind: 'pay', slot: 1, mana: 0.4, charge: 0 });
    expect(floats(1)).toEqual([]);

    // At most three live per slot; each goes when its animation ends.
    for (let i = 0; i < 3; i++) floatPay({ kind: 'pay', slot: 0, mana: 8, charge: 0 });
    expect(floats(0)).toHaveLength(3);
    anims.forEach((a) => a.onfinish?.());
    expect(floats(0)).toHaveLength(0);
    expect(floats(2)).toHaveLength(0);
    Element.prototype.animate = original;
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ArenaHud.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../arena/hud/floatPay" from "src/features/delve/__tests__/ArenaHud.test.tsx". Does the file exist?`

- [ ] **Step 3: The pieces**

Create `packages/client/src/features/delve/arena/hud/floatPay.ts`:

```ts
import type { ArpgEvent } from '@alloy/engine';

/** A paid cost's colour: the mana bar's, or the charge's. */
const PAY_COLOR = { mana: '#2ce8f5', charge: '#fee761' };
/** Floating costs live at once above one slot (they're cosmetic). */
const PAY_FLOATS = 3;

/**
 * A skill's spend rising from its slot and fading over a second: its mana
 * ("−16"), else its charge ("−78 charge"), rounded; nothing when that rounds to 0.
 * A real element animated in place (just a fade under reduced motion), removed
 * when it ends; the oldest goes first past `PAY_FLOATS`.
 */
export function floatPay(e: Extract<ArpgEvent, { kind: 'pay' }>): void {
  const slot = document.querySelector(`[data-testid="ability-${e.slot}"]`);
  const mana = Math.round(e.mana);
  const amount = mana > 0 ? mana : Math.round(e.charge);
  if (!slot || amount <= 0) return;
  const live = slot.querySelectorAll('[data-pay]');
  if (live.length >= PAY_FLOATS) live[0].remove();
  const el = document.createElement('span');
  el.dataset.pay = '';
  el.setAttribute('aria-hidden', 'true');
  // From the slot's top edge upward, over the arena: the dock's hard shadow keeps it legible.
  el.className =
    'k-disp pointer-events-none absolute left-1/2 -top-2 z-10 -translate-x-1/2 whitespace-nowrap text-[20px]';
  el.style.color = mana > 0 ? PAY_COLOR.mana : PAY_COLOR.charge;
  el.textContent = mana > 0 ? `−${amount}` : `−${amount} charge`;
  slot.append(el);
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const anim = el.animate?.(
    still
      ? [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }]
      : [
          // `transform`, not `translate`: the class's `translate` centres it.
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 1, offset: 0.4 },
          { opacity: 0, transform: 'translateY(-24px)' },
        ],
    { duration: 1000, easing: 'ease-out', fill: 'forwards' },
  );
  if (anim) anim.onfinish = () => el.remove();
}
```

Create `packages/client/src/features/delve/arena/hud/Vitals.tsx`:

```tsx
import { formatNumber } from '../../format';
import type { ArenaHud } from '../useArena';

const LIFE = 'repeating-linear-gradient(90deg, #63c74d 0 12px, #3e8948 12px 14px)';
const BARRIER = 'repeating-linear-gradient(90deg, #ead4aa 0 12px, #c28569 12px 14px)';
const MANA = 'repeating-linear-gradient(90deg, #2ce8f5 0 2px, #0099db 2px 12px, #124e89 12px 14px)';

const pct = (f: number) => `${f * 100}%`;

/**
 * The dock's two long bars: life (32 px green planks, Obsidian's barrier a pale segment after
 * it, over its end when there's no room) and mana (24 px, the stepped mana glow), each with its
 * numbers on it.
 */
export function Vitals({ hud }: { hud: ArenaHud | null }) {
  if (!hud) return null;
  const life = Math.max(0, hud.hp) / Math.max(1, hud.maxHp);
  const mana = hud.mana / Math.max(1, hud.manaMax);
  const barrier = hud.barrier ? Math.min(1, hud.barrier.hp / Math.max(1, hud.maxHp)) : 0;
  return (
    <div className="flex flex-col gap-[14px] pt-[10px]">
      <div
        className={`k-bar k-lifeframe ${life < 0.3 ? 'animate-pulse' : ''}`}
        style={{ height: 32 }}
        data-testid="hero-hp"
      >
        <div className="k-bar-fill" style={{ left: 0, width: pct(life), background: LIFE }} />
        {hud.barrier && (
          <div
            className="k-bar-fill"
            data-testid="hp-barrier"
            style={{
              left: pct(Math.min(life, 1 - barrier)),
              width: pct(barrier),
              background: BARRIER,
            }}
          />
        )}
        <span className="k-bar-label k-disp text-[22px]">
          {formatNumber(Math.max(0, hud.hp))} / {formatNumber(hud.maxHp)}
          {hud.barrier && ` · barrier ${formatNumber(hud.barrier.hp)}`}
        </span>
      </div>
      <div
        className="k-bar k-mana"
        style={{ height: 24 }}
        data-testid="mana-bar"
        aria-label={`Mana ${Math.floor(hud.mana)} of ${Math.round(hud.manaMax)}`}
      >
        <div
          className="k-bar-fill"
          style={{ left: 0, width: pct(mana), background: MANA, transition: 'width 0.1s linear' }}
        />
        <span className="k-bar-label k-disp text-[19px]">
          {formatNumber(Math.floor(hud.mana))} / {formatNumber(Math.round(hud.manaMax))}
        </span>
      </div>
    </div>
  );
}
```

Create `packages/client/src/features/delve/arena/hud/BossBar.tsx`:

```tsx
import { Glyph } from '@/features/delve/kit';
import { formatNumber } from '../../format';
import type { ArenaHud } from '../useArena';

const BOSS_LIFE = 'repeating-linear-gradient(90deg, #e43b44 0 12px, #a22633 12px 14px)';

/**
 * The boss's name and life, only while a boss lives: a `HudGrid` child, under the top bar and
 * centred in the middle column.
 */
export function BossBar({ hud }: { hud: ArenaHud | null }) {
  if (!hud?.boss) return null;
  const { boss } = hud;
  return (
    <div
      className="flex w-[420px] flex-col gap-2"
      style={{ gridColumn: 2, gridRow: 2, alignSelf: 'start', justifySelf: 'center' }}
      data-testid="boss-bar"
    >
      <div className="k-disp flex items-center justify-center gap-2 text-[22px] text-[var(--k-bad-text)]">
        <Glyph id="skull" size={20} />
        {boss.name}
      </div>
      <div className="k-bar k-lifeframe" style={{ height: 16 }}>
        <div
          className="k-bar-fill"
          style={{
            left: 0,
            width: `${(Math.max(0, boss.hp) / Math.max(1, boss.maxHp)) * 100}%`,
            background: BOSS_LIFE,
          }}
        />
        <span className="k-bar-label k-disp text-[14px]">
          {formatNumber(Math.max(0, boss.hp))} / {formatNumber(boss.maxHp)}
        </span>
      </div>
    </div>
  );
}
```

Create `packages/client/src/features/delve/arena/hud/BuffRow.tsx`:

```tsx
import { Glyph } from '@/features/delve/kit';

/**
 * A timed buff on the hero (the spec's contract; 3C's snapshot fills `ArenaHud.buffs`). No
 * Galvanize: its spark is on the slots.
 */
export interface HudBuff {
  id: 'riposte' | 'quick' | 'barrier';
  /** Seconds left, from riposteUntil, quickUntil and barrier.until. */
  left: number;
  total: number | null;
}

const BUFF: Record<HudBuff['id'], { name: string; color: string }> = {
  riposte: { name: 'Riposte', color: '#fee761' },
  quick: { name: 'Quick', color: '#feae34' },
  barrier: { name: 'Barrier', color: '#ead4aa' },
};

/** The dock's buff tiles: 38 px each, its glyph and its seconds left. */
export function BuffRow({ buffs }: { buffs: readonly HudBuff[] }) {
  if (buffs.length === 0) return null;
  return (
    <div className="ml-3 flex gap-[6px]">
      {buffs.map((b) => {
        const { name, color } = BUFF[b.id];
        const secs = Math.ceil(b.left);
        return (
          <span
            key={b.id}
            role="img"
            aria-label={`${name}, ${secs}s left`}
            data-buff={b.id}
            className="flex h-[38px] w-[38px] flex-col items-center justify-end bg-[var(--k-well)] pb-px"
            style={{ border: `2px solid ${color}`, color }}
          >
            <Glyph id={b.id} size={16} />
            <span className="k-disp text-[14px]">{secs}s</span>
          </span>
        );
      })}
    </div>
  );
}
```

In `packages/client/src/features/delve/arena/ArenaHud.tsx`:

Replace:

```tsx
import type { ArpgEvent, BiomeDef, DiveState, RuneRef, Vec } from '@alloy/engine';
```

with:

```tsx
import type { BiomeDef, DiveState, RuneRef, Vec } from '@alloy/engine';
```

Replace the lines from `/** A paid cost's colour: the mana bar's, or the charge meter's. */` up to (not including) `/** Seconds the buttons still cooling down spark after Galvanize. */` with:

```tsx
// The spend's float lives in hud/floatPay.ts; useArenaCore imports it from here until the integrator.
export { floatPay } from './hud/floatPay';

```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ArenaHud.test.tsx)`
Expected: PASS (5 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N − 15 tests in F files pass (the file held 20 tests of today's buttons and now holds 5).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3a-3a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/floatPay.ts src/features/delve/arena/hud/Vitals.tsx src/features/delve/arena/hud/BossBar.tsx src/features/delve/arena/hud/BuffRow.tsx src/features/delve/arena/ArenaHud.tsx src/features/delve/__tests__/ArenaHud.test.tsx)
git add packages/client/src/features/delve/arena/hud/floatPay.ts packages/client/src/features/delve/arena/hud/Vitals.tsx packages/client/src/features/delve/arena/hud/BossBar.tsx packages/client/src/features/delve/arena/hud/BuffRow.tsx packages/client/src/features/delve/arena/ArenaHud.tsx packages/client/src/features/delve/__tests__/ArenaHud.test.tsx
git commit -m "feat(client): the HUD's life and mana bars, boss bar, buff tiles and floating spend in arena/hud" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The skill dock

### Task 2: `SkillSlot`, `SkillTooltip` and `SkillDock`

The dock (`skill-bar`, no box, a 2 px hard text shadow): Q, E and R stacked as 76 px steel slots in their element's border with the name (22 px), the chain-step bar (16×5 segments) and the cost line beside each, the glass tooltip beside the row; then Dodge, Potion ×n and Attack (56 px) with the buff tiles; then the bars. A slot click casts auto-aimed; no slot takes the focus (Space must reach the dodge, not a focused button).

**Files:**
- Create: `packages/client/src/features/delve/arena/hud/SkillSlot.tsx`
- Create: `packages/client/src/features/delve/arena/hud/SkillTooltip.tsx`
- Create: `packages/client/src/features/delve/arena/hud/SkillDock.tsx`
- Modify: `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/ArenaHud.test.tsx`:

Replace the lines from `import { describe, it, expect, vi } from 'vitest';` up to (not including) `` /** A HUD snapshot (cast: 3C's snapshot adds `buffs` and `map`). */ `` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  moveBeat,
  moveNumbers,
} from '@alloy/engine';
import { floatPay } from '../arena/hud/floatPay';
import { Vitals } from '../arena/hud/Vitals';
import { BossBar } from '../arena/hud/BossBar';
import { BuffRow, type HudBuff } from '../arena/hud/BuffRow';
import { SkillDock, type SkillDockProps } from '../arena/hud/SkillDock';
import type { AbilityHud, ArenaHud } from '../arena/useArena';
import { getDelveRegistry } from '../registry';
import { FAMILY_STYLE } from '../runes/rune-style';
import { formatNumber } from '../format';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

const registry = getDelveRegistry();

/** The first rune of a family in the data. */
const runeOf = (family: string) => registry.getRunes().find((r) => r.family === family)!;

```

Append at the end of the file:

```tsx
/** A light Fire Bolt, ready: the first of a 1-move chain. */
const BOLT: AbilityHud = {
  name: 'Fire Bolt',
  icon: '☄️',
  form: 'bolt',
  element: 'fire',
  elements: ['fire'],
  payment: 'mana',
  cost: 8,
  cooldown: 0,
  cooldownTotal: 5,
  beat: false,
  charge: null,
  chainStep: 0,
  chainLength: 1,
  nextKind: 'light',
  hold: null,
  windup: null,
  affordable: true,
  ready: true,
  runes: [],
};

function dock(
  over: Partial<ArenaHud> & { buffs?: HudBuff[] } = {},
  props: Partial<SkillDockProps> = {},
) {
  return (
    <SkillDock
      hud={hud(over)}
      onCast={() => {}}
      onDodge={() => {}}
      onPotion={() => {}}
      onAttack={() => {}}
      manualAttack={false}
      {...props}
    />
  );
}

describe('the skill dock', () => {
  beforeEach(() => useInputDeviceStore.setState({ device: 'keyboard' }));

  it("names each chain's next move, marks its step, and shows a hold's charge with its ticks", () => {
    const held = { ...BOLT, nextKind: 'hold' as const, chainStep: 1, chainLength: 4 };
    render(
      dock({ abilities: [{ ...held, hold: { charge: 0.5, stage: 1 } }, BOLT, BOLT], busy: true }),
    );
    const slot = screen.getByTestId('ability-0');
    expect(slot).toHaveAccessibleName('Primary: held Fire Bolt');
    expect(screen.getByTestId('ability-1')).toHaveAccessibleName('Defensive: light Fire Bolt');
    const row = slot.parentElement!;
    const steps = [...row.querySelectorAll('[data-chain]')];
    expect(steps.map((d) => d.getAttribute('data-chain'))).toEqual([
      'step',
      'next',
      'step',
      'step',
    ]);
    expect(slot.querySelector('[data-hold]')).toHaveAttribute('data-stage', '1');
    // One tick, at the halfway stage: the bar's end is full power.
    const ticks = [...slot.querySelectorAll('[data-tick]')] as HTMLElement[];
    expect(ticks.map((t) => t.style.left)).toEqual(['50%']);
    // The hold dims the others as a channel does, never its own slot.
    expect(slot.style.opacity).toBe('1');
    expect(screen.getByTestId('ability-1').style.opacity).toBe('0.5');
  });

  it("shows a dot per rune acting on the next move, in its family's colour; none without", () => {
    const shape = runeOf('shape');
    const sustain = runeOf('sustain');
    const runes = [
      { id: shape.id, tier: 3 as const },
      { id: sustain.id, tier: 1 as const },
    ];
    render(dock({ abilities: [{ ...BOLT, runes }, BOLT] }));
    const dots = [...screen.getByTestId('ability-0').querySelectorAll('[data-rune]')];
    expect(dots.map((d) => d.getAttribute('data-rune'))).toEqual([shape.id, sustain.id]);
    expect(dots[0]).toHaveStyle({ background: FAMILY_STYLE.shape.color });
    expect(dots[1]).toHaveStyle({ background: FAMILY_STYLE.sustain.color });
    expect(screen.getByTestId('ability-1').querySelector('[data-rune]')).toBeNull();
  });

  it("has no row for a skill the weapon doesn't carry; the others keep their slots", () => {
    render(dock({ abilities: [BOLT, null, { ...BOLT, name: 'Fire Nova' }] }));
    expect(screen.getByTestId('ability-0')).toBeInTheDocument();
    expect(screen.queryByTestId('ability-1')).toBeNull();
    expect(screen.getByTestId('ability-2')).toHaveAccessibleName('Ultimate: light Fire Nova');
  });

  it('a click on a slot casts it auto-aimed, and never takes the focus', () => {
    const onCast = vi.fn();
    render(dock({ abilities: [BOLT, BOLT, BOLT] }, { onCast }));
    const slot = screen.getByTestId('ability-2');
    expect(fireEvent.mouseDown(slot)).toBe(false); // default prevented: no focus
    fireEvent.click(slot);
    expect(onCast).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('writes the cost line in mana or charge, amber when it cannot be paid', () => {
    render(
      dock({
        abilities: [
          BOLT,
          { ...BOLT, payment: 'charge', charge: 0.62 },
          { ...BOLT, payment: 'cast', cost: 87.4, affordable: false },
        ],
      }),
    );
    expect(screen.getByTestId('ability-cost-0')).toHaveTextContent('8 mana');
    expect(screen.getByTestId('ability-cost-0').style.color).toBe('var(--k-mana)');
    expect(screen.getByTestId('ability-cost-1')).toHaveTextContent('charge 62%');
    expect(screen.getByTestId('ability-cost-2')).toHaveTextContent('87 mana · cast');
    expect(screen.getByTestId('ability-cost-2').style.color).toBe('var(--k-hot)');
  });

  it('draws the bound input for the device holding the lock', () => {
    const { rerender } = render(dock({ abilities: [BOLT] }));
    expect(screen.getByTestId('ability-0')).toHaveTextContent('Q');
    expect(screen.getByTestId('dodge-button')).toHaveTextContent('Space');
    act(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    rerender(dock({ abilities: [BOLT] }));
    expect(screen.getByTestId('ability-0')).toHaveTextContent('RT');
    expect(screen.getByTestId('dodge-button')).toHaveTextContent('LT');
  });

  it('fills a cooling slot from the bottom with its seconds, and a beat without', () => {
    const fill = (slot: number) =>
      screen.getByTestId(`ability-${slot}`).querySelector('[data-sweep]') as HTMLElement | null;
    const cooling: AbilityHud = { ...BOLT, cooldown: 2.5, cooldownTotal: 5, ready: false };
    const beating: AbilityHud = { ...cooling, cooldown: 0.3, cooldownTotal: 0.6, beat: true };
    render(dock({ abilities: [cooling, beating, BOLT] }));
    expect(fill(0)).toHaveAttribute('data-sweep', 'cooldown');
    expect(fill(0)!.style.height).toBe('50%');
    expect(screen.getByTestId('ability-0')).toHaveTextContent('2.5');
    expect(fill(1)).toHaveAttribute('data-sweep', 'beat');
    expect(screen.getByTestId('ability-1')).not.toHaveTextContent('0.3');
    expect(screen.getByTestId('ability-1')).toHaveAttribute('data-ready', 'false');
    expect(fill(2)).toBeNull();
  });

  it('the fill glides between refreshes while it empties, and snaps when it rises', () => {
    const at = (cooldown: number) =>
      dock({ abilities: [{ ...BOLT, cooldown, cooldownTotal: 0.6, beat: true, ready: false }] });
    const fill = () => screen.getByTestId('ability-0').querySelector('[data-sweep]') as HTMLElement;
    const { rerender } = render(at(0.6));
    expect(fill().style.transition).toBe('none');
    rerender(at(0.3));
    expect(fill().style.height).toBe('50%');
    expect(fill().style.transition).toBe('height 80ms linear');
    // A refresh at the same height (a pause, a hit-stop) doesn't cut the glide short.
    rerender(at(0.3));
    expect(fill().style.transition).toBe('height 80ms linear');
    // A new beat starts: the fill jumps back up at once.
    rerender(at(0.6));
    expect(fill().style.transition).toBe('none');
  });

  it('sparks the slots still cooling down for 0.4 s after Galvanize', () => {
    const cooling: AbilityHud = { ...BOLT, cooldown: 3, ready: false };
    const abilities = [cooling, { ...cooling, cooldown: 0, ready: true }];
    const galvanize = (galvanizedAt: number | null) => dock({ abilities, galvanizedAt, t: 10 });
    const spark = (slot: number) =>
      screen.getByTestId(`ability-${slot}`).querySelector('[data-spark]');
    const { rerender } = render(galvanize(9.8));
    expect(spark(0)).not.toBeNull();
    expect(spark(1)).toBeNull();
    rerender(galvanize(9.5));
    expect(spark(0)).toBeNull();
    rerender(galvanize(null));
    expect(spark(0)).toBeNull();
    // Galvanize cuts cooldowns, not beats: a beat gets no spark.
    rerender(dock({ abilities: [{ ...cooling, beat: true }], galvanizedAt: 9.8, t: 10 }));
    expect(spark(0)).toBeNull();
  });

  it("shows the hovered skill's tooltip from the hero's resolved chain", () => {
    const stats = computeHeroStats({}, registry);
    const world = createSandboxWorld(registry, {
      depth: 5,
      stats,
      chains: defaultChains(registry, 'fire', null),
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
    const move = world.hero.chains[0]!.moves[0];
    const quick = runeOf('tempo');
    render(
      dock(
        { abilities: [{ ...BOLT, name: move.name, runes: [{ id: quick.id, tier: 2 }] }] },
        { world: { current: world } },
      ),
    );
    expect(screen.queryByTestId('skill-tooltip-0')).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('ability-0'));
    const tip = screen.getByTestId('skill-tooltip-0');
    expect(tip).toHaveTextContent(`${move.name}move 1 of 1 · light`);
    const bal = registry.getDelveBalance();
    expect(screen.getByTestId('num-hit')).toHaveTextContent(
      formatNumber(moveNumbers(stats, bal, move).hit),
    );
    expect(screen.getByTestId('num-cost')).toHaveTextContent(`${Math.round(move.cost)} mana`);
    expect(screen.getByTestId('num-beat')).toHaveTextContent(
      `${+moveBeat(bal, move, stats.tempo).toFixed(2)}s`,
    );
    expect(tip).toHaveTextContent(`${quick.name} II`);
    fireEvent.mouseLeave(screen.getByTestId('ability-0'));
    expect(screen.queryByTestId('skill-tooltip-0')).toBeNull();
  });

  it('opens the tooltip while its hold charges, without a world: the name line alone', () => {
    const held = { ...BOLT, nextKind: 'hold' as const, hold: { charge: 0.2, stage: 0 } };
    render(dock({ abilities: [held] }));
    expect(screen.getByTestId('skill-tooltip-0')).toHaveTextContent('Fire Boltmove 1 of 1 · hold');
    expect(screen.queryByTestId('num-hit')).toBeNull();
  });
});

describe('the dodge, potion and attack slots', () => {
  it('shows a pip per dodge charge, the next refilling, and dodges on a click', () => {
    const onDodge = vi.fn();
    render(dock({ riposte: true }, { onDodge }));
    const button = screen.getByTestId('dodge-button');
    expect(button).toHaveAttribute('data-charges', '1');
    expect(button).toHaveAttribute('data-riposte', 'true');
    expect(button.querySelectorAll('[data-pip="full"]')).toHaveLength(1);
    const empty = button.querySelector('[data-pip="empty"]')!;
    expect((empty.firstElementChild as HTMLElement).style.width).toBe('40%');
    fireEvent.click(button);
    expect(onDodge).toHaveBeenCalledTimes(1);
  });

  it('drinks a potion on a click, and is disabled with none left', () => {
    const onPotion = vi.fn();
    const { rerender } = render(dock({}, { onPotion }));
    expect(screen.getByTestId('potion-button')).toHaveTextContent('×3');
    fireEvent.click(screen.getByTestId('potion-button'));
    expect(onPotion).toHaveBeenCalledTimes(1);
    rerender(dock({ potions: 0 }, { onPotion }));
    expect(screen.getByTestId('potion-button')).toBeDisabled();
  });

  it('shows the Attack slot in both modes: "Auto", dimmed, or a tap in Manual', () => {
    const onAttack = vi.fn();
    const { rerender } = render(dock({}, { onAttack }));
    const button = screen.getByTestId('attack-button');
    expect(button).toHaveAttribute('data-mode', 'auto');
    expect(button).toHaveTextContent('Auto');
    expect(button.style.opacity).toBe('0.5');
    fireEvent.click(button);
    expect(onAttack).not.toHaveBeenCalled();
    rerender(dock({}, { onAttack, manualAttack: true }));
    expect(button).toHaveAttribute('data-mode', 'manual');
    fireEvent.click(button);
    expect(onAttack).toHaveBeenCalledTimes(1);
  });

  it("dots the Attack slot with the next blow's runes, and shows a held blow charging", () => {
    const tempo = runeOf('tempo');
    render(
      dock({
        basicRunes: [{ id: tempo.id, tier: 2 }],
        basicHold: { charge: 0.7, stage: 2 },
      }),
    );
    const button = screen.getByTestId('attack-button');
    expect(button.querySelector('[data-rune]')).toHaveStyle({
      background: FAMILY_STYLE.tempo.color,
    });
    expect(button.querySelector('[data-hold]')).toHaveAttribute('data-stage', '2');
  });

  it("puts the snapshot's buffs beside them", () => {
    render(dock({ buffs: [{ id: 'barrier', left: 5, total: 6 }] }));
    expect(screen.getByRole('img', { name: 'Barrier, 5s left' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ArenaHud.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../arena/hud/SkillDock" from "src/features/delve/__tests__/ArenaHud.test.tsx". Does the file exist?`

- [ ] **Step 3: The slot, the tooltip and the dock**

Create `packages/client/src/features/delve/arena/hud/SkillSlot.tsx`:

```tsx
import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import type { RuneRef } from '@alloy/engine';
import { Glyph, InputGlyph, type Binding } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { moveText } from '../../chains/chain-text';
import { FAMILY_STYLE } from '../../runes/rune-style';
import type { AbilityHud } from '../useArena';

/** A HUD slot's steel (the mockup's `.slot`); the caller sets its size and border colour. */
export const SLOT_STYLE: CSSProperties = {
  background: '#262b44',
  border: '4px solid #5a6988',
  boxShadow: '0 0 0 3px #181425, inset 0 3px 0 #8b9bb4, inset 0 -3px 0 #181425',
};

/** A press never takes the focus, so Space and the arena's keys keep reaching the fight. */
export const noFocus = (e: MouseEvent) => e.preventDefault();

const SLOT_LABEL = ['Primary', 'Defensive', 'Ultimate'];

/** Seconds Galvanize's spark stays on the slots still cooling down. */
export const GALVANIZE_SPARK = 0.4;

/** The input bound to a slot, at its bottom-right corner. */
export function BoundGlyph({ binding }: { binding: Binding }) {
  return (
    <span className="absolute -bottom-[10px] -right-[14px]">
      <InputGlyph binding={binding} size="sm" />
    </span>
  );
}

/** The runes acting on the next move or blow: a dot each in its family's colour (`data-rune`). */
export function RuneDots({ runes }: { runes: readonly RuneRef[] }) {
  if (runes.length === 0) return null;
  const registry = getDelveRegistry();
  return (
    <span className="absolute left-[6px] top-[5px] flex gap-[3px]" aria-hidden>
      {runes.map((r, k) => (
        <span
          key={k}
          data-rune={r.id}
          className="h-[6px] w-[6px]"
          style={{ background: FAMILY_STYLE[registry.getRune(r.id).family].color }}
        />
      ))}
    </span>
  );
}

/**
 * A charge filling over the slot's top edge: a hold's (`data-hold`, `data-stage` the stage
 * reached, a tick at each stage short of full power) or a channel's (no ticks).
 */
export function TickBar({ value, color, stage }: { value: number; color: string; stage?: number }) {
  const ticks =
    stage === undefined
      ? []
      : getDelveRegistry()
          .getDelveBalance()
          .chains.holdStages.filter((s) => s < 1);
  return (
    <span
      className="absolute -top-[14px] left-0 right-0 h-[6px] bg-[var(--k-well)]"
      style={{ boxShadow: '0 0 0 2px #3a4466' }}
      data-hold={stage === undefined ? undefined : ''}
      data-stage={stage}
    >
      <span
        className="block h-full"
        style={{ width: `${value * 100}%`, background: color, transition: 'width 80ms linear' }}
      />
      {ticks.map((s) => (
        <span
          key={s}
          data-tick
          className="absolute inset-y-0 w-[2px] bg-[var(--k-text)]"
          style={{ left: `${s * 100}%` }}
        />
      ))}
    </span>
  );
}

/**
 * One skill's 76 px steel slot in its element's border: the next move's form glyph, the bound
 * input, rune dots, a cooldown fill rising from the bottom with its seconds (a beat's without),
 * a hold's charge as a tick bar, Galvanize's spark, and the spends `floatPay` floats from it. A
 * click casts it auto-aimed.
 */
export function SkillSlot({
  slot,
  ab,
  busy,
  galvanized,
  binding,
  onCast,
}: {
  slot: 0 | 1 | 2;
  ab: AbilityHud;
  /** An ability is channelling or a hold is charging (presses wait for it). */
  busy: boolean;
  /** Galvanize just fired: a cooling slot sparks. */
  galvanized: boolean;
  binding: Binding;
  onCast: (slot: 0 | 1 | 2) => void;
}) {
  const color = manaStyle(getDelveRegistry(), ab.elements[0]).color;
  const cooling = ab.cooldown > 0.05;
  const frac = cooling ? Math.min(1, ab.cooldown / ab.cooldownTotal) : 0;
  // The fill glides between the HUD's refreshes while it empties, and snaps when it rises (a
  // refresh at the same height, in a pause or a hit-stop, keeps the glide going).
  const last = useRef(0);
  const glide = frac <= last.current;
  useEffect(() => {
    last.current = frac;
  });
  return (
    <button
      type="button"
      className="pointer-events-auto relative flex h-[76px] w-[76px] items-center justify-center p-0"
      style={{
        ...SLOT_STYLE,
        borderColor: color,
        opacity: busy && ab.windup === null && ab.hold === null ? 0.5 : ab.affordable ? 1 : 0.55,
      }}
      aria-label={`${SLOT_LABEL[slot]}: ${moveText({ kind: ab.nextKind, name: ab.name })}`}
      data-testid={`ability-${slot}`}
      data-ready={ab.ready}
      onMouseDown={noFocus}
      onClick={() => onCast(slot)}
    >
      <Glyph id={ab.form} size={38} color={color} />
      {frac > 0 && (
        <span
          className="absolute inset-x-0 bottom-0 bg-[rgba(24,20,37,0.78)]"
          data-sweep={ab.beat ? 'beat' : 'cooldown'}
          style={{ height: `${frac * 100}%`, transition: glide ? 'height 80ms linear' : 'none' }}
        />
      )}
      {cooling && !ab.beat && (
        <span className="k-disp absolute inset-0 flex items-center justify-center text-[26px]">
          {ab.cooldown >= 10 ? Math.ceil(ab.cooldown) : ab.cooldown.toFixed(1)}
        </span>
      )}
      <RuneDots runes={ab.runes} />
      {ab.hold !== null && <TickBar value={ab.hold.charge} color={color} stage={ab.hold.stage} />}
      {ab.windup !== null && <TickBar value={ab.windup} color={color} />}
      {galvanized && cooling && !ab.beat && (
        <span data-spark aria-hidden className="absolute -left-[10px] -top-[10px]">
          <Glyph id="galvanize" size={20} />
        </span>
      )}
      <BoundGlyph binding={binding} />
    </button>
  );
}
```

Create `packages/client/src/features/delve/arena/hud/SkillTooltip.tsx`:

```tsx
import type { ArpgWorld } from '@alloy/engine';
import { TooltipCard } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { NumberTable, moveRows } from '../../chains/MoveEditor';
import { runeName } from '../../runes/rune-style';
import type { AbilityHud } from '../useArena';

/** The rows of `moveRows` the HUD's card shows: Hit, Cost (with the runes' load) and Beat after. */
const SHOWN = new Set(['hit', 'cost', 'beat']);

/**
 * The glass card beside a skill's row: the next move's name, "move n of m · kind", then its Hit,
 * Cost and Beat after from the hero's resolved chain (`moveNumbers`, `moveBeat`, through
 * `moveRows`), and its runes. Without the world (none yet) it shows the name line alone.
 */
export function SkillTooltip({
  slot,
  ab,
  world,
}: {
  slot: 0 | 1 | 2;
  ab: AbilityHud;
  world: ArpgWorld | null;
}) {
  const registry = getDelveRegistry();
  const hero = world?.hero;
  const move = hero?.chains[slot]?.moves[ab.chainStep];
  const rows =
    hero && move
      ? moveRows(move, null, hero.stats, hero.manaMax).rows.filter((r) => SHOWN.has(r.id))
      : [];
  return (
    <div className="[text-shadow:none]" data-testid={`skill-tooltip-${slot}`}>
      <TooltipCard
        material="glass"
        width={320}
        title={ab.name}
        subtitle={`move ${ab.chainStep + 1} of ${ab.chainLength} · ${ab.nextKind}`}
      >
        {rows.length > 0 && <NumberTable rows={rows} />}
        {ab.runes.length > 0 && (
          <div className="text-[14px] text-[var(--k-mana)]">
            {ab.runes.map((r) => runeName(registry, r)).join(' · ')}
          </div>
        )}
      </TooltipCard>
    </div>
  );
}
```

Create `packages/client/src/features/delve/arena/hud/SkillDock.tsx`:

```tsx
import type { RefObject } from 'react';
import type { ArpgWorld } from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import type { ControlAction, ControlsConfig } from '@/features/controls/controls';
import { Glyph, Tooltip, type Binding } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import type { AbilityHud, ArenaHud } from '../useArena';
import { BuffRow, type HudBuff } from './BuffRow';
import { Vitals } from './Vitals';
import { SkillTooltip } from './SkillTooltip';
import {
  BoundGlyph,
  GALVANIZE_SPARK,
  RuneDots,
  SLOT_STYLE,
  SkillSlot,
  TickBar,
  noFocus,
} from './SkillSlot';

export interface SkillDockProps {
  hud: ArenaHud | null;
  onCast: (slot: 0 | 1 | 2) => void;
  onDodge: () => void;
  onPotion: () => void;
  onAttack: () => void;
  /** The Attack slot's mode. */
  manualAttack: boolean;
  /** The fight's world, for the skill tooltip's numbers (3A's addition to the contract). */
  world?: RefObject<ArpgWorld | null>;
}

const SLOT_ACTION = ['primary', 'defensive', 'ultimate'] as const;

/** An action's key and pad button from the player's setup. */
const bindingOf = (cfg: ControlsConfig, action: ControlAction): Binding => ({
  key: cfg.keys[action] ?? undefined,
  pad: cfg.pad[action] ?? undefined,
});

/** The cost line under a skill's name: its mana (and a cast's wind-up), or its charge. */
function costText(ab: AbilityHud): string {
  if (ab.payment === 'charge') return `charge ${Math.floor((ab.charge ?? 0) * 100)}%`;
  return `${Math.round(ab.cost)} mana${ab.payment === 'cast' ? ' · cast' : ''}`;
}

/**
 * The HUD's bottom-left dock (Hades style, no box): Q, E and R stacked, each its slot, name,
 * chain-step bar and cost line, with its tooltip beside the row on hover, on focus, or while
 * its hold charges; then Dodge, Potion and Attack with the buff tiles; then the life and mana
 * bars. A skill the weapon doesn't carry has no row.
 */
export function SkillDock({
  hud,
  onCast,
  onDodge,
  onPotion,
  onAttack,
  manualAttack,
  world,
}: SkillDockProps) {
  const config = useControlsStore((s) => s.config);
  const registry = getDelveRegistry();
  const galvanized =
    !!hud && hud.galvanizedAt !== null && hud.t - hud.galvanizedAt < GALVANIZE_SPARK;
  // 3C's snapshot adds `buffs`; until it does, there are none.
  const buffs = (hud as (ArenaHud & { buffs?: HudBuff[] }) | null)?.buffs ?? [];
  const charges = hud?.dodgeCharges ?? 0;
  const max = hud?.dodgeMax ?? 2;
  const refill = hud?.dodgeRefill ?? 0;
  const riposte = !!hud?.riposte;
  return (
    <div
      className="flex w-[600px] flex-col gap-4 [text-shadow:2px_2px_0_#181425]"
      data-testid="skill-bar"
      aria-label="Skills and vitals"
    >
      {hud?.abilities.map((ab, i) => {
        if (!ab) return null;
        const slot = i as 0 | 1 | 2;
        const color = manaStyle(registry, ab.elements[0]).color;
        return (
          <Tooltip
            key={slot}
            placement="right"
            portal={false}
            openWhile={ab.hold !== null}
            content={() => <SkillTooltip slot={slot} ab={ab} world={world?.current ?? null} />}
          >
            <div className="grid grid-cols-[76px_260px] items-center gap-[22px] self-start">
              <SkillSlot
                slot={slot}
                ab={ab}
                busy={hud.busy}
                galvanized={galvanized}
                binding={bindingOf(config, SLOT_ACTION[slot])}
                onCast={onCast}
              />
              <div className="flex flex-col gap-[6px]">
                <span className="k-disp text-[22px]">{ab.name}</span>
                <span className="flex gap-[3px]" aria-hidden>
                  {Array.from({ length: ab.chainLength }, (_, k) => (
                    <span
                      key={k}
                      data-chain={k === ab.chainStep ? 'next' : 'step'}
                      className="h-[5px] w-4"
                      style={{
                        background:
                          k < ab.chainStep
                            ? color
                            : k === ab.chainStep
                              ? 'var(--k-text)'
                              : 'var(--k-steel-1)',
                      }}
                    />
                  ))}
                </span>
                <span
                  className="text-[14px]"
                  data-testid={`ability-cost-${slot}`}
                  style={{
                    color: !ab.affordable
                      ? 'var(--k-hot)'
                      : ab.payment === 'charge'
                        ? 'var(--k-text-2)'
                        : 'var(--k-mana)',
                  }}
                >
                  {costText(ab)}
                </span>
              </div>
            </div>
          </Tooltip>
        );
      })}
      <div className="flex items-end gap-[22px] pt-1">
        <button
          type="button"
          className="pointer-events-auto relative flex h-14 w-14 items-center justify-center"
          style={{
            ...SLOT_STYLE,
            borderColor: riposte ? '#fee761' : '#5a6988',
            opacity: charges > 0 ? 1 : 0.55,
          }}
          aria-label="Dodge"
          data-testid="dodge-button"
          data-charges={charges}
          data-riposte={riposte}
          onMouseDown={noFocus}
          onClick={onDodge}
        >
          <Glyph id="dodge" size={28} />
          <span className="absolute inset-x-[6px] top-[5px] flex gap-[3px]" aria-hidden>
            {Array.from({ length: max }, (_, k) => (
              <span
                key={k}
                data-pip={k < charges ? 'full' : 'empty'}
                className="relative h-[5px] flex-1 bg-[var(--k-steel-1)]"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-[var(--k-text)]"
                  style={{ width: k < charges ? '100%' : k === charges ? `${refill * 100}%` : 0 }}
                />
              </span>
            ))}
          </span>
          <BoundGlyph binding={bindingOf(config, 'dodge')} />
        </button>
        <button
          type="button"
          className="pointer-events-auto relative flex h-14 w-14 flex-col items-center justify-center"
          style={SLOT_STYLE}
          aria-label="Drink potion"
          data-testid="potion-button"
          disabled={!hud || hud.potions <= 0}
          onMouseDown={noFocus}
          onClick={onPotion}
        >
          <Glyph id="potion" size={22} />
          <span className="k-disp text-[16px]">×{hud?.potions ?? 0}</span>
          <BoundGlyph binding={bindingOf(config, 'potion')} />
        </button>
        <button
          type="button"
          className="pointer-events-auto relative flex h-14 w-14 items-center justify-center"
          style={{ ...SLOT_STYLE, opacity: manualAttack ? 1 : 0.5 }}
          aria-label="Attack"
          data-testid="attack-button"
          data-mode={manualAttack ? 'manual' : 'auto'}
          onMouseDown={noFocus}
          onClick={manualAttack ? onAttack : undefined}
        >
          {manualAttack ? (
            <Glyph id="attack" size={28} />
          ) : (
            <span className="k-disp text-[18px]">Auto</span>
          )}
          {hud && <RuneDots runes={hud.basicRunes} />}
          {hud?.basicHold && (
            <TickBar value={hud.basicHold.charge} color="#fee761" stage={hud.basicHold.stage} />
          )}
          {manualAttack && (
            <BoundGlyph binding={{ ...bindingOf(config, 'attack'), mouse: 'lmb' }} />
          )}
        </button>
        <BuffRow buffs={buffs} />
      </div>
      <Vitals hud={hud} />
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ArenaHud.test.tsx)`
Expected: PASS (21 tests). jsdom prints no `act(...)` warnings.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 1 tests in F files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3a-3a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/SkillSlot.tsx src/features/delve/arena/hud/SkillTooltip.tsx src/features/delve/arena/hud/SkillDock.tsx src/features/delve/__tests__/ArenaHud.test.tsx)
git add packages/client/src/features/delve/arena/hud/SkillSlot.tsx packages/client/src/features/delve/arena/hud/SkillTooltip.tsx packages/client/src/features/delve/arena/hud/SkillDock.tsx packages/client/src/features/delve/__tests__/ArenaHud.test.tsx
git commit -m "feat(client): the skill dock: Q/E/R slots with name, chain step, cost and tooltip; dodge, potion, attack and buffs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The grid, the purse and the pages

### Task 3: `HudGrid` and `PurseBar`

The grid (`inset: 24px`, `380px minmax(0,1fr) 340px` by `48px minmax(0,1fr)`, 16 px gaps, `pointer-events: none`) and its insets, and the glass purse bar.

**Files:**
- Create: `packages/client/src/features/delve/arena/hud/HudGrid.tsx`
- Create: `packages/client/src/features/delve/arena/hud/PurseBar.tsx`
- Create: `packages/client/src/features/delve/__tests__/HudGrid.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/__tests__/HudGrid.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createDelveProfile, startDive } from '@alloy/engine';
import { HudGrid } from '../arena/hud/HudGrid';
import { PurseBar } from '../arena/hud/PurseBar';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useUIStore } from '@/stores/uiStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

/** Where each part sits on a 1920×1080 window, by its `data-hud` (the life bar by its id). */
let boxes: Record<string, DOMRect>;
const rect = (el: Element) =>
  boxes[el.getAttribute('data-hud') ?? el.getAttribute('data-testid') ?? ''] ?? new DOMRect();

describe('HudGrid', () => {
  beforeEach(() => {
    boxes = {
      top: new DOMRect(24, 24, 1516, 48),
      right: new DOMRect(1556, 24, 340, 1032),
      dock: new DOMRect(24, 700, 600, 356),
      'hero-hp': new DOMRect(24, 990, 600, 32),
    };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return rect(this);
    });
    window.innerWidth = 1920;
    window.innerHeight = 1080;
  });
  afterEach(() => vi.restoreAllMocks());

  const grid = (onInsets: (i: unknown) => void, life = true) => (
    <HudGrid
      onInsets={onInsets}
      testId="hud"
      top={<div />}
      right={<div />}
      dock={life && <div data-testid="hero-hp" />}
    >
      <span data-testid="overlay" />
    </HudGrid>
  );

  it('is the zoomed HUD root, laying its children on the grid', () => {
    render(grid(() => {}));
    const root = screen.getByTestId('hud');
    expect(root).toHaveClass('delve-ui', 'delve-hud-zoom', 'pointer-events-none');
    expect(screen.getByTestId('overlay').parentElement).toBe(root);
  });

  it("reports the camera's insets in viewport px, again on a resize or a HUD scale change, only when they change", () => {
    const onInsets = vi.fn();
    const { rerender } = render(grid(onInsets));
    expect(onInsets).toHaveBeenCalledExactlyOnceWith({ top: 72, right: 364, bottom: 90, left: 0 });
    act(() => window.dispatchEvent(new Event('resize')));
    expect(onInsets).toHaveBeenCalledTimes(1);
    boxes.top = new DOMRect(30, 30, 1500, 60);
    boxes.right = new DOMRect(1475, 30, 425, 1020);
    act(() => useUIStore.setState({ hudScale: 1.25 }));
    expect(onInsets).toHaveBeenLastCalledWith({ top: 90, right: 445, bottom: 90, left: 0 });
    // No life bar (no snapshot yet): the dock's top edge.
    rerender(grid(onInsets, false));
    act(() => window.dispatchEvent(new Event('resize')));
    expect(onInsets).toHaveBeenLastCalledWith({ top: 90, right: 445, bottom: 380, left: 0 });
    act(() => useUIStore.setState({ hudScale: 1 }));
  });
});

describe('PurseBar', () => {
  const registry = getDelveRegistry();

  beforeEach(() => {
    useInputDeviceStore.setState({ device: 'keyboard' });
    const profile = {
      ...createDelveProfile(registry, 7),
      scrap: 2412,
      links: 5,
      manaDust: 40,
      runes: { quick: [2, 1, 0, 0, 0] },
    };
    const dived = startDive(registry, profile, 1);
    useDelveStore.setState({
      profile: {
        ...dived,
        dive: { ...dived.dive!, bounty: 26, linksEarned: 1, dustEarned: 6, runesEarned: 1 },
      },
      diveDrops: ['a', 'b', 'c', 'd'],
    });
  });

  const purse = (onMenu = () => {}, onJournal?: () => void) => (
    <PurseBar dive={useDelveStore.getState().profile.dive!} onMenu={onMenu} onJournal={onJournal} />
  );

  it("shows each resource held and this dive's gain, and what banks on extract", () => {
    render(purse());
    const bag = useDelveStore.getState().profile.bag.length;
    const cap = registry.getDelveBalance().loot.bagSize;
    const row = (id: string, name: string, text: string) => {
      const el = screen.getByTestId(`purse-${id}`);
      expect(within(el).getByRole('img', { name })).toBeInTheDocument();
      expect(el).toHaveTextContent(text);
    };
    row('scrap', 'Scrap', '2,412+26');
    row('links', 'Links', '5+1');
    row('dust', 'Mana Dust', '40+6');
    row('runes', 'Runes', '3+1');
    row('items', 'Items', `${bag} / ${cap}+4`);
    expect(screen.getByTestId('bounty')).toHaveTextContent('+26');
    expect(screen.getByTestId('purse-bar')).toHaveTextContent('+26 banks on extract');
  });

  it('"Dive menu" carries the menu marker and presses onMenu; Journal waits for 3b', () => {
    const onMenu = vi.fn();
    const { rerender } = render(purse(onMenu));
    const menu = screen.getByRole('button', { name: 'Dive menu' });
    expect(menu).toHaveAttribute('data-pad-menu');
    expect(menu).toHaveTextContent('EscMenu');
    fireEvent.click(menu);
    fireEvent.click(menu);
    expect(onMenu).toHaveBeenCalledTimes(2);
    const journal = screen.getByRole('button', { name: /Journal/ });
    expect(journal).toHaveAttribute('data-pad-journal');
    expect(journal).toBeDisabled();
    const onJournal = vi.fn();
    rerender(purse(onMenu, onJournal));
    fireEvent.click(journal);
    expect(onJournal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('purse-bar')).toHaveTextContent('AltLabels');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/HudGrid.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../arena/hud/HudGrid" from "src/features/delve/__tests__/HudGrid.test.tsx". Does the file exist?`

- [ ] **Step 3: The grid and the purse**

Create `packages/client/src/features/delve/arena/hud/HudGrid.tsx`:

```tsx
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useUiScale } from '@/features/delve/kit';

/** The camera's insets, in viewport px (the spec's contract; 3C's renderer takes them). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface HudGridProps {
  top: ReactNode;
  right: ReactNode;
  dock: ReactNode;
  onInsets: (insets: Insets) => void;
  testId?: string;
  /** Laid on the grid itself, e.g. the BossBar (3A's addition to the contract). */
  children?: ReactNode;
}

/**
 * The dive HUD as one grid under the HUD's zoom (never over the arena host): a 24 px margin, a
 * 48 px top bar over columns 1–2, a 340 px right column over both rows, and the 600 px dock at
 * the bottom of columns 1–2, with the middle clear. Only its panels and slots take the pointer.
 * It reports the camera's insets (`onInsets`, stable; only when they change) on mount, on a
 * resize of any part or of the window, and on a HUD scale change: the top bar's bottom edge, the
 * window's width less the right column's left edge, and its height less the life bar's top edge
 * (the dock's while there is none).
 */
export function HudGrid({ top, right, dock, onInsets, testId, children }: HudGridProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const { hud } = useUiScale();

  useLayoutEffect(() => {
    let last = '';
    const measure = () => {
      const [t, r, d] = [topRef.current, rightRef.current, dockRef.current];
      if (!t || !r || !d) return;
      const life = d.querySelector('[data-testid="hero-hp"]') ?? d;
      const insets: Insets = {
        top: t.getBoundingClientRect().bottom,
        right: window.innerWidth - r.getBoundingClientRect().left,
        bottom: window.innerHeight - life.getBoundingClientRect().top,
        left: 0,
      };
      const key = `${insets.top} ${insets.right} ${insets.bottom}`;
      if (key === last) return;
      last = key;
      onInsets(insets);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [topRef.current, rightRef.current, dockRef.current]) if (el) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [hud, onInsets]);

  return (
    <div
      className="delve-ui delve-hud-zoom pointer-events-none absolute inset-6 z-20 grid grid-cols-[380px_minmax(0,1fr)_340px] grid-rows-[48px_minmax(0,1fr)] gap-4"
      data-testid={testId}
    >
      <div
        ref={topRef}
        className="min-w-0"
        data-hud="top"
        style={{ gridColumn: '1 / 3', gridRow: 1 }}
      >
        {top}
      </div>
      <div
        ref={rightRef}
        data-hud="right"
        className="flex min-h-0 flex-col gap-4"
        style={{ gridColumn: 3, gridRow: '1 / 3' }}
      >
        {right}
      </div>
      <div
        ref={dockRef}
        data-hud="dock"
        className="w-[600px]"
        style={{ gridColumn: '1 / 3', gridRow: 2, alignSelf: 'end' }}
      >
        {dock}
      </div>
      {children}
    </div>
  );
}
```

Create `packages/client/src/features/delve/arena/hud/PurseBar.tsx`:

```tsx
import type { DiveState } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import { Glyph, InputGlyph, type Binding, type GlyphId } from '@/features/delve/kit';
import { JOURNAL_BINDING } from '../../quests/QuestTracker';
import { getDelveRegistry } from '../../registry';
import { noFocus } from './SkillSlot';

/** Hold to show every drop's label (3C's `labels` action; its default). */
export const LABELS_BINDING: Binding = { key: 'AltLeft', pad: 'ls', whileHeld: true };

const n = (x: number) => x.toLocaleString('en-US');

/**
 * The dive's top bar (glass): "Purse", then scrap, Links, Mana Dust, runes and the bag, each its
 * glyph (named for screen readers), the amount held and this dive's gain (the scrap's is the
 * bounty, in amber); "+N banks on extract"
 * (`bounty`); and at the right end the Labels hint, Journal (`data-pad-journal`; disabled until
 * there is `onJournal`) and Menu ("Dive menu", `data-pad-menu`), which opens the menu.
 */
export function PurseBar({
  dive,
  onMenu,
  onJournal,
}: {
  dive: DiveState;
  onMenu: () => void;
  onJournal?: () => void;
}) {
  const profile = useDelveStore((s) => s.profile);
  const drops = useDelveStore((s) => s.diveDrops.length);
  const config = useControlsStore((s) => s.config);
  const bagSize = getDelveRegistry().getDelveBalance().loot.bagSize;
  const runes = Object.values(profile.runes).reduce(
    (sum, tiers) => sum + tiers.reduce((a, b) => a + b, 0),
    0,
  );
  const purse: { id: string; glyph: GlyphId; name: string; held: string; gain: number }[] = [
    { id: 'scrap', glyph: 'scrap', name: 'Scrap', held: n(profile.scrap), gain: dive.bounty },
    { id: 'links', glyph: 'link', name: 'Links', held: n(profile.links), gain: dive.linksEarned },
    {
      id: 'dust',
      glyph: 'dust',
      name: 'Mana Dust',
      held: n(profile.manaDust),
      gain: dive.dustEarned,
    },
    { id: 'runes', glyph: 'rune', name: 'Runes', held: n(runes), gain: dive.runesEarned },
    {
      id: 'items',
      glyph: 'chest',
      name: 'Items',
      held: `${profile.bag.length} / ${bagSize}`,
      gain: drops,
    },
  ];
  return (
    <div
      className="k-glass pointer-events-auto flex h-full items-center gap-6 px-4"
      data-testid="purse-bar"
    >
      <span className="k-disp text-[20px] text-[var(--k-hot-hi)]">Purse</span>
      {purse.map((r) => (
        <span
          key={r.id}
          className="flex items-center gap-2 whitespace-nowrap text-[15px]"
          data-testid={`purse-${r.id}`}
        >
          <Glyph id={r.glyph} size={18} title={r.name} />
          <b className="k-disp text-[19px]">{r.held}</b>
          <b
            className="k-disp text-[19px]"
            style={{ color: r.id === 'scrap' ? 'var(--k-hot)' : 'var(--k-ok)' }}
          >
            +{n(r.gain)}
          </b>
        </span>
      ))}
      <span className="whitespace-nowrap text-[14px] text-[var(--k-text-3)]">
        <b className="text-[var(--k-hot)]" data-testid="bounty">
          +{n(dive.bounty)}
        </b>{' '}
        banks on extract
      </span>
      <span className="ml-auto flex items-center gap-4 whitespace-nowrap text-[14px] text-[var(--k-text-2)]">
        <span className="flex items-center gap-[6px]">
          <InputGlyph binding={LABELS_BINDING} size="sm" />
          Labels
        </span>
        <button
          type="button"
          className="flex items-center gap-[6px] disabled:opacity-60"
          data-pad-journal
          disabled={!onJournal}
          onMouseDown={noFocus}
          onClick={onJournal}
        >
          <InputGlyph binding={JOURNAL_BINDING} size="sm" />
          Journal
        </button>
        <button
          type="button"
          className="flex items-center gap-[6px]"
          aria-label="Dive menu"
          data-pad-menu
          onMouseDown={noFocus}
          onClick={onMenu}
        >
          <InputGlyph
            binding={{ key: config.keys.menu ?? undefined, pad: config.pad.menu ?? undefined }}
            size="sm"
          />
          Menu
        </button>
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/HudGrid.test.tsx)`
Expected: PASS (4 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 5 tests in F + 1 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3a-3a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/HudGrid.tsx src/features/delve/arena/hud/PurseBar.tsx src/features/delve/__tests__/HudGrid.test.tsx)
git add packages/client/src/features/delve/arena/hud/HudGrid.tsx packages/client/src/features/delve/arena/hud/PurseBar.tsx packages/client/src/features/delve/__tests__/HudGrid.test.tsx
git commit -m "feat(client): the HUD grid reports the camera's insets; the purse bar" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
### Task 4: The Training Grounds on the grid (the minimal port)

`HudGrid` with the `SkillDock`; today's top-bar contents in a glass bar; today's docked `TrainingPanel` in the right column under `zoom: calc(1 / var(--hud-scale))` (decided item 38); the sheet layout for narrow windows as today. The page stops importing `ArenaHud.tsx`.

**Files:**
- Modify: `packages/client/src/pages/DelveTraining.tsx`
- Modify: `packages/client/src/pages/__tests__/DelveTraining.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/pages/__tests__/DelveTraining.test.tsx`:

Replace:

```tsx
    fireEvent.click(screen.getByTestId('rune-picker-close'));
    expect(live.calls.at(-1)).toBe(true);
    expect(live.paused.at(-1)).toBe(false);
  });
});
```

with:

```tsx
    fireEvent.click(screen.getByTestId('rune-picker-close'));
    expect(live.calls.at(-1)).toBe(true);
    expect(live.paused.at(-1)).toBe(false);
  });

  it("docks today's panel in the HUD's right column at its own size, the skill dock and the top bar on the grid", () => {
    render(
      <MemoryRouter>
        <DelveTraining />
      </MemoryRouter>,
    );
    const docked = screen.getByText('Socket 1').parentElement!;
    expect(docked.closest('[data-hud="right"]')).not.toBeNull();
    expect(docked.getAttribute('style')).toContain('zoom: calc(1 / var(--hud-scale))');
    expect(screen.getByTestId('skill-bar').closest('[data-hud="dock"]')).not.toBeNull();
    expect(screen.getByTestId('training-back').closest('[data-hud="top"]')).not.toBeNull();
    expect(screen.getByTestId('training-panel-toggle')).toHaveAttribute('data-pad-menu');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveTraining.test.tsx)`
Expected: FAIL, 1 of 2: "docks today's panel in the HUD's right column…": `expect(received).not.toBeNull()` (no `[data-hud="right"]` around the panel yet).

- [ ] **Step 3: The port**

In `packages/client/src/pages/DelveTraining.tsx`:

Replace:

```tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
```

with:

```tsx
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
```

Replace:

```tsx
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useControlsStore } from '@/stores/controlsStore';
```

with:

```tsx
import { useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
import {
  AttackButton,
  BossBar,
  keyHints,
  padHints,
  SkillBar,
  Vitals,
} from '@/features/delve/arena/ArenaHud';
```

with:

```tsx
import { HudGrid, type Insets } from '@/features/delve/arena/hud/HudGrid';
import { SkillDock } from '@/features/delve/arena/hud/SkillDock';
import { BossBar } from '@/features/delve/arena/hud/BossBar';
```

Replace:

```tsx
import {
  DOCK_WIDTH,
  DepthLabel,
```

with:

```tsx
import {
  DepthLabel,
```

Replace:

```tsx
import '@/features/delve/delve.css';

const fineMouse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
```

with:

```tsx
import '@/features/delve/delve.css';
```

Replace:

```tsx
  const hostRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 60, bottom: 190 });
```

with:

```tsx
  const hostRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
```

Delete the lines from `// Keep the camera clear of the HUD.` up to (not including) `// A rune picker over the docked panel pauses too: Space and the pad belong to it.`.

Replace:

```tsx
  const manualAttack = useDelveStore((s) => s.manualAttack);
  const device = useInputDeviceStore((s) => s.device);
  const controls = useControlsStore((s) => s.config);
  const hints = device === 'gamepad' ? padHints(controls) : fineMouse ? keyHints(controls) : null;
```

with:

```tsx
  const manualAttack = useDelveStore((s) => s.manualAttack);
```

Replace:

```tsx
  const exit = useCallback(() => navigate('/delve'), [navigate]);
```

with:

```tsx
  const exit = useCallback(() => navigate('/delve'), [navigate]);
  /** The Attack slot's click in Manual: one blow, as a tap of the attack input. */
  const tapAttack = () => {
    arena.attack(true);
    arena.attack(false);
  };
  const trainingPanel = panel && (
    <TrainingPanel
      layout={panel}
      tab={tab}
      onTab={setTab}
      onClose={closePanel}
      onExit={exit}
      actions={arena.actions}
      meter={arena.meter}
      onOpenControls={openControls}
    />
  );
```

Replace the lines from `{/* The arena and its HUD narrow beside a docked panel, so the camera centres in view. */}` up to (not including) `{/* After the panel: the controller's back button and focus go to the topmost one. */}` with:

```tsx
      <div ref={hostRef} className="absolute inset-0" data-testid="arena" />
      <ArenaControls
        input={arena.input}
        heroScreen={arena.heroScreen}
        pixelsPerUnit={arena.pixelsPerUnit}
        disabled={paused}
        manualAttack={manualAttack}
      />

      <HudGrid
        onInsets={setInsets}
        top={
          <div
            className="k-glass pointer-events-auto flex h-full items-center gap-2 px-4"
            onPointerUp={blurOnPointerUp}
          >
            <button
              type="button"
              className="delve-btn px-2.5 py-1.5 text-sm"
              onClick={exit}
              aria-label="Back to the Anvil"
              data-testid="training-back"
            >
              ◂<span className="hidden sm:inline"> Anvil</span>
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
              <DepthLabel />
              <MeterChip meter={arena.meter} onReset={arena.actions.resetMeter} />
            </div>
            <LabButton />
            <button
              type="button"
              className="delve-btn px-2.5 py-1.5 text-sm"
              aria-label="Panel"
              aria-expanded={panel !== null}
              onClick={togglePanel}
              data-pad-menu
              data-testid="training-panel-toggle"
            >
              ☰<span className="hidden sm:inline"> Panel</span>
            </button>
          </div>
        }
        right={
          // Today's panel, its small text kept at its own size until 3F rebuilds it (decided item 38).
          panel === 'dock' && (
            <div
              className="pointer-events-auto relative min-h-0 flex-1"
              style={{ zoom: 'calc(1 / var(--hud-scale))' }}
            >
              {trainingPanel}
            </div>
          )
        }
        dock={
          <SkillDock
            hud={arena.hud}
            world={arena.worldRef}
            onCast={arena.cast}
            onDodge={arena.dodge}
            onPotion={arena.potion}
            onAttack={tapAttack}
            manualAttack={manualAttack}
          />
        }
      >
        <BossBar hud={arena.hud} />
      </HudGrid>

      {panel === 'sheet' && trainingPanel}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveTraining.test.tsx)`
Expected: PASS (2 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 6 tests in F + 1 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3a-3a
(cd packages/client && npx prettier --write --end-of-line auto src/pages/DelveTraining.tsx src/pages/__tests__/DelveTraining.test.tsx)
git add packages/client/src/pages/DelveTraining.tsx packages/client/src/pages/__tests__/DelveTraining.test.tsx
git commit -m "feat(client): the Training Grounds on the HUD grid: the skill dock, a glass top bar, the docked panel in the right column" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
### Task 5: The dive on the grid (on `ui/p3a`, after 3B)

`DelveRun` composes `HudGrid` with `PurseBar`, 3B's `FloorColumn` and the `SkillDock` (hidden while choosing a door or on the summary, as today's strip), with the `BossBar` on the grid; the purse's Menu opens the dive menu (never toggles it); the banners take the hard shadow. `ArenaHud.tsx` keeps only `floatPay`'s re-export, so nothing imports `aim-gestures.ts` from it any more (3C's deletion can follow).

**Where:** `ui/p3a` in `C:/Projects/alloy-ui-p3a`, once 3A's Tasks 1–4 and 3B are merged and before 3C (see Base). Measure its counts first (`(cd packages/client && npx vitest run)`): call them **M tests in G files**.

**Files:**
- Modify: `packages/client/src/pages/DelveRun.tsx`
- Modify: `packages/client/src/features/delve/arena/ArenaHud.tsx`
- Create: `packages/client/src/pages/__tests__/DelveRun.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/pages/__tests__/DelveRun.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createDelveProfile, startDive } from '@alloy/engine';
import { createArenaInput } from '@/features/delve/arena/input';
import { getDelveRegistry } from '@/features/delve/registry';
import { useDelveStore } from '@/stores/delveStore';
import { DelveRun } from '../DelveRun';

// The arena itself (Pixi) stands still: the page's HUD is what's under test.
vi.mock('@/features/delve/arena/useArena', () => ({
  useArena: () => ({
    input: createArenaInput(),
    heroScreen: () => null,
    pixelsPerUnit: () => 30,
    hud: null,
    worldRef: { current: null },
    cast: () => {},
    aim: () => {},
    cancelHold: () => {},
    potion: () => {},
    dodge: () => {},
    attack: () => {},
  }),
}));

describe('DelveRun', () => {
  beforeEach(() => {
    const registry = getDelveRegistry();
    useDelveStore.setState({ profile: startDive(registry, createDelveProfile(registry, 7), 1) });
  });

  it('lays the purse, the right column and the skill dock on the HUD grid, beside the arena host', () => {
    render(
      <MemoryRouter>
        <DelveRun />
      </MemoryRouter>,
    );
    const top = screen.getByTestId('purse-bar').closest('[data-hud="top"]');
    expect(top).not.toBeNull();
    expect(screen.getByTestId('skill-bar').closest('[data-hud="dock"]')).not.toBeNull();
    const grid = top!.parentElement!;
    expect(grid).toHaveClass('delve-hud-zoom');
    expect(grid.contains(screen.getByTestId('arena'))).toBe(false);
  });

  it("the purse's Menu opens the dive menu and never toggles it closed", () => {
    render(
      <MemoryRouter>
        <DelveRun />
      </MemoryRouter>,
    );
    const menu = screen.getByRole('button', { name: 'Dive menu' });
    fireEvent.click(menu);
    expect(screen.getByTestId('attack-mode-toggle')).toBeInTheDocument();
    fireEvent.click(menu);
    expect(screen.getByTestId('attack-mode-toggle')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: FAIL, 2 of 2: `Unable to find an element by: [data-testid="purse-bar"]`, and `Unable to find an element by: [data-testid="attack-mode-toggle"]` after the second click (today's kebab button toggles the menu closed).

- [ ] **Step 3: The page and the last of `ArenaHud.tsx`**

In `packages/client/src/pages/DelveRun.tsx`:

Replace:

```tsx
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useControlsStore } from '@/stores/controlsStore';
```

with:

```tsx
import { useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
import { PickupFeed } from '@/features/delve/arena/PickupFeed';
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
import {
  AttackButton,
  BossBar,
  keyHints,
  padHints,
  SkillBar,
  TopHud,
  Vitals,
} from '@/features/delve/arena/ArenaHud';
```

with:

```tsx
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
import { HudGrid, type Insets } from '@/features/delve/arena/hud/HudGrid';
import { PurseBar } from '@/features/delve/arena/hud/PurseBar';
import { SkillDock } from '@/features/delve/arena/hud/SkillDock';
import { BossBar } from '@/features/delve/arena/hud/BossBar';
import { FloorColumn } from '@/features/delve/arena/hud/FloorColumn';
import { useQuests } from '@/features/delve/quests/useQuests';
```

Replace:

```tsx
        style={{ color: banner.color, textShadow: `0 0 24px ${banner.color}, 0 3px 0 #000` }}
```

with:

```tsx
        style={{ color: banner.color, textShadow: '2px 2px 0 #181425' }}
```

Replace:

```tsx
        <div className="delve-display mt-1 text-sm font-semibold text-stone-100 drop-shadow">
```

with:

```tsx
        <div className="delve-display mt-1 text-sm font-semibold text-stone-100 [text-shadow:2px_2px_0_#181425]">
```

Replace:

```tsx
const fineMouse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

export function DelveRun() {
```

with:

```tsx
export function DelveRun() {
```

Replace:

```tsx
  const hostRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 70, bottom: 190 });
```

with:

```tsx
  const hostRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
```

Delete the lines from `// Keep the camera clear of the HUD.` up to (not including) `const arenaRef = useRef<ReturnType<typeof useArena> | null>(null);`.

Replace:

```tsx
  const manualAttack = useDelveStore((s) => s.manualAttack);
  // The controller drives the fight while it's live; menus take it back when paused.
  const device = useInputDeviceStore((s) => s.device);
  const controls = useControlsStore((s) => s.config);
  const hints = device === 'gamepad' ? padHints(controls) : fineMouse ? keyHints(controls) : null;
  const arena = useArena(hostRef, { paused, insets, onUi, manualAttack });
  arenaRef.current = arena;
```

with:

```tsx
  const manualAttack = useDelveStore((s) => s.manualAttack);
  const arena = useArena(hostRef, { paused, insets, onUi, manualAttack });
  arenaRef.current = arena;
  const { quests } = useQuests();
```

Replace:

```tsx
    setSheetUid(uid);
  };
```

with:

```tsx
    setSheetUid(uid);
  };
  /** The Attack slot's click in Manual: one blow, as a tap of the attack input. */
  const tapAttack = () => {
    arena.attack(true);
    arena.attack(false);
  };
```

Replace the lines from `<TopHud` up to (not including) `{banners[0] && <Banner key={banners[0].id} banner={banners[0]} onDone={popBanner} />}` with:

```tsx
      <HudGrid
        onInsets={setInsets}
        top={<PurseBar dive={dive} onMenu={() => setMenuOpen(true)} />}
        right={
          <FloorColumn
            dive={dive}
            biome={biome}
            hud={arena.hud}
            quests={quests}
            onInspect={openItem}
            onJournal={() => {}}
          />
        }
        dock={
          !choosing &&
          !finished && (
            <SkillDock
              hud={arena.hud}
              world={arena.worldRef}
              onCast={arena.cast}
              onDodge={arena.dodge}
              onPotion={arena.potion}
              onAttack={tapAttack}
              manualAttack={manualAttack}
            />
          )
        }
      >
        <BossBar hud={arena.hud} />
      </HudGrid>

```

In `packages/client/src/features/delve/arena/ArenaHud.tsx`:

Replace the lines from `import {` up to the end of the file with:

```tsx
// The dive HUD lives in arena/hud/ (Delve UI v1, 3a). This keeps useArenaCore's `floatPay` import
// working until the integrator points it at './hud/floatPay' and deletes this file.
export { floatPay } from './hud/floatPay';
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: PASS (2 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 2 tests in G + 1 files pass. `grep -rn "aim-gestures" packages/client/src/features/delve/arena/ArenaHud.tsx` prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3a
(cd packages/client && npx prettier --write --end-of-line auto src/pages/DelveRun.tsx src/features/delve/arena/ArenaHud.tsx src/pages/__tests__/DelveRun.test.tsx)
git add packages/client/src/pages/DelveRun.tsx packages/client/src/features/delve/arena/ArenaHud.tsx packages/client/src/pages/__tests__/DelveRun.test.tsx
git commit -m "feat(client): the dive on the HUD grid: purse, right column and skill dock; ArenaHud keeps only floatPay's re-export" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification (the area's end check)

- [ ] After Task 4, in the 3A worktree: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` — no type errors; **N + 6 tests in F + 1 files**. `git status` is clean and `git log --oneline ui/p3a..` shows four commits.
- [ ] After Task 5, on `ui/p3a`: the same — no type errors; **M + 2 tests in G + 1 files**; `npx prettier --end-of-line auto --check` passes on every file this plan touched.
- [ ] A manual look (dev server, 1920×1080 and 1280×720, mouse and keys, then a pad): the dock bottom-left with three rows on an epic weapon, hover a slot for its card, Q/E/R and the slot clicks cast, the purse fits on one line at 1280×720, Esc / the purse's Menu opens the dive menu, and the Training Grounds' docked panel sits in the right column.

**E2E ids for the integrator** (spec "E2E in 3a"; the specs themselves are the integrator's):

| Id / name | Where now | E2E effect |
|---|---|---|
| `skill-bar` | the 600 px dock root | D06 unchanged (inside the viewport) |
| `ability-0..2` | the 76 px slot; aria "Primary: light Fire Bolt" as today; `data-ready`; `[data-rune]` dots (rune id); `[data-pay]` floats | D01, G04, R02, T01, T02 unchanged; a `click()` casts auto-aimed (T01) |
| `ability-0` text | the pad glyph's text ("RT") under the pad, the key ("Q") otherwise | G02 may assert `ability-0` contains "RT" |
| `dodge-button` | `data-charges`, `data-riposte`; text "LT" under the pad, "Space" otherwise | G02, G05 unchanged |
| `potion-button` | "Drink potion", "×n" | unchanged |
| `attack-button` | always shown; `data-mode="auto"` / `"manual"` | D05: replace `toBeVisible()` (manual) with `toHaveAttribute('data-mode', 'manual')` and `toHaveCount(0)` (auto) with `toHaveAttribute('data-mode', 'auto')` |
| `hero-hp`, `hp-barrier` | the life bar and its pale segment; label "226 / 289 · barrier 34" | D01 unchanged |
| `mana-bar` | aria-label "Mana N of M"; text "N / M" | G04 unchanged |
| `bounty` | the purse's "+N" before "banks on extract" | D01: `not.toHaveText('⚙ 0')` becomes `toHaveText(/[1-9]\d*/)` |
| "Dive menu" (role button) | the purse's Menu (`data-pad-menu`); opens, never closes | D01, D02 click it as today; the kebab menu it opens is today's until 3b |
| `data-pad-journal` | the purse's Journal (disabled until 3b) | none in 3a |
| `boss-bar` | on the grid under the top bar | unchanged |
| `depth-label`, `monsters-left`, `biome-element`, `pickup-feed`, `loot-item` | 3B's `FloorColumn` | 3B's |
| `training-back`, `meter-chip`, `training-panel-toggle` | the Training glass bar, in that order | T01's geometry holds; T03 (the sheet at 900 px) unchanged |
| `training-panel` | docked in the right column (or the sheet) | T01, T02 unchanged |
| the arena host | `[data-testid="arena"]`, never under `.delve-hud-zoom` | the new "no zoomed ancestor" check |
