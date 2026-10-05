# Delve pad navigation and guidance · 01: the navigation core — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The D-pad picks the control a player expects: only what lies beyond the focused control's edge, the beam before the cone, never a control scrolled out of view, staying inside a pane while it can and returning to where it left; the kit's tabs leave the D-pad; and an E2E audit holds it there.

**Architecture:** `spatial-nav.ts` stays pure geometry (`pickNext`, same signature, new rule). `use-gamepad-nav.ts` gains the DOM rules around it: `candidates(active)` (the clipped rule), groups (`[data-pad-group]`, set by the kit) with a per-group memory, and `nextFocus(el, dir, { memory })`, which `moveFocus` focuses. The rule was prototyped in the page against the real hub screens before this plan was written (spec §1.1's table): the code below is that prototype.

**Tech Stack:** TypeScript 5.7, React 19, Vitest 3 (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-delve-pad-nav-guidance-design.md` §1.1 to §1.4 and §3 (the `spatial-nav` and `use-gamepad-nav` unit tests, the tests that encode today's rules, `e2e/delve-pad-nav.spec.ts`). The overview is `00-overview.md` (branch, commands, conventions, the "From 01" contract this plan must deliver).

---

## Files

| File | Change |
|---|---|
| `packages/client/src/features/gamepad/spatial-nav.ts` | `pickNext`'s new rule; `CONE` (Task 1) |
| `packages/client/src/features/gamepad/__tests__/spatial-nav.test.ts` (new) | Task 1's tests |
| `packages/client/src/features/gamepad/use-gamepad-nav.ts` | `FOCUSABLE` exported, `candidates(active)`, `isCandidate`, the clipped rule (Task 2); `groupOf`, the group memory, `nextFocus`, `moveFocus` on it, `keepFocus` by group (Task 3); `stepTabs`' three outcomes (Task 5) |
| `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts` | Tasks 2, 3 and 5's tests |
| `packages/client/src/features/delve/kit/surfaces.tsx` | `data-pad-group` on `Panel` (plate, glass), `Header`, `Footer` (Task 4) |
| `packages/client/src/features/delve/kit/controls.tsx` | `data-pad-skip` on `Tabs`' tablist (Task 4) |
| `packages/client/src/features/delve/kit/__tests__/surfaces.test.tsx`, `controls.test.tsx` | Task 4's tests |
| `packages/client/src/pages/DelveTraining.tsx`, `pages/__tests__/DelveTraining.test.tsx` | the dock's focus on opening (Task 5) |
| `packages/client/e2e/delve-pad-nav.spec.ts` (new) | the audit and the three walks (Task 6) |
| `packages/client/e2e/delve-gamepad.spec.ts` | walks that encoded the old picks (Task 7) |

## Where the spec left room

1. **Sub-pixel edges:** "beyond the edge" allows 0.5 px (`EPS`), so two controls on one row whose tops differ by a rounding never count as above or below each other.
2. **Scroll containers** are ancestors below `<body>` whose computed `overflow-x` or `overflow-y` is `auto` or `scroll`. `overflow: hidden` clips nothing for this rule (a sheet sliding in under one is still focused before it arrives).
3. **The memory is written by `keepFocus`** (it already runs every frame and sees every focus, the mouse's too), not by `moveFocus`. Unit tests call `keepFocus()` between moves, as a frame would.
4. **The screen's footer** for `stepTabs`' third outcome is the kit `Screen`'s `[data-screen-section="screen-foot"]`.
5. **The Training dock** focuses its first control not under `[data-pad-skip]` (a plain query, as today's is: jsdom has no layout for `candidates`).

## Before Task 1

```bash
cd /c/Projects/Alloy
git switch -c padnav
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

Expected: tsup's "Build success" lines, no type errors, every client test passing. Write the test and file counts down: later "all green" steps compare to them.

---

## Chunk 1: the picking rule and the candidates

### Task 1: `pickNext` by edge, beam and cone

**Files:**
- Modify: `packages/client/src/features/gamepad/spatial-nav.ts` (whole file)
- Create: `packages/client/src/features/gamepad/__tests__/spatial-nav.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/gamepad/__tests__/spatial-nav.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickNext, type NavRect } from '../spatial-nav';

/** A box `w` × `h` at `x`, `y`. */
const box = (id: string, x: number, y: number, w = 10, h = 10): NavRect => ({ id, x, y, w, h });
const pick = (from: NavRect, others: NavRect[], dir: Parameters<typeof pickNext>[2]) =>
  pickNext(from, [from, ...others], dir)?.id ?? null;

describe('pickNext', () => {
  it('takes only what lies beyond the edge: a box around or behind the focused one never counts', () => {
    const from = box('from', 100, 0, 100, 20);
    // Wider than `from` and under it: its centre is 10 px to the right, but it is not to the right.
    const under = box('under', 60, 300, 200, 20);
    expect(pick(from, [under], 'right')).toBeNull();
    expect(pick(from, [under], 'left')).toBeNull();
    expect(pick(from, [under], 'down')).toBe('under');
    // An overlapping neighbour whose both edges lie further right counts.
    expect(pick(from, [box('lapped', 190, 0, 100, 20)], 'right')).toBe('lapped');
  });

  it('prefers the beam: a box straight ahead beats a nearer one off to the side', () => {
    const from = box('from', 0, 0);
    const ahead = box('ahead', 100, 0);
    const aside = box('aside', 30, 40);
    expect(pick(from, [ahead, aside], 'right')).toBe('ahead');
  });

  it('in the beam the nearest wins, a tie going to the one more in line', () => {
    const from = box('from', 0, 0, 40, 10);
    expect(pick(from, [box('far', 0, 80, 40, 10), box('near', 0, 30, 40, 10)], 'down')).toBe('near');
    // Both 20 px below; `inline` shares the centre.
    const inline = box('inline', 10, 30, 20, 10);
    const offset = box('offset', 30, 30, 40, 10);
    expect(pick(from, [offset, inline], 'down')).toBe('inline');
  });

  it('off the beam, takes only what lies in the cone', () => {
    const from = box('from', 0, 0);
    // 100 px on and 20 px aside: in the cone.
    expect(pick(from, [box('near-line', 100, 30)], 'right')).toBe('near-line');
    // 20 px on and 90 px aside: a different row, not "to the right".
    expect(pick(from, [box('below', 20, 100)], 'right')).toBeNull();
  });

  it('steps a ragged, wrapped grid row by row', () => {
    // Row 1: a, b. Row 2: one short chip that sits between them. Row 3: a chip under b.
    const b = box('b', 70, 0, 60, 20);
    const gap = box('gap', 50, 30, 15, 20);
    const under = box('under', 70, 60, 60, 20);
    expect(pick(b, [box('a', 0, 0, 60, 20), gap, under], 'down')).toBe('gap');
  });

  it('never lets a far diagonal box beat the beam', () => {
    const from = box('from', 500, 0, 20, 20);
    const footer = box('footer', 0, 900, 1900, 60);
    const corner = box('corner', 300, 600, 100, 50);
    expect(pick(from, [footer, corner], 'down')).toBe('footer');
  });

  it('stays put at an edge', () => {
    const from = box('from', 0, 0);
    expect(pick(from, [box('right', 40, 0)], 'left')).toBeNull();
    expect(pick(from, [], 'down')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/spatial-nav.test.ts)`
Expected: FAIL. Today's centre rule picks `under` to the right in the first test, `aside` in the second and `below` in the fourth.

- [ ] **Step 3: Write the rule**

Replace the whole of `packages/client/src/features/gamepad/spatial-nav.ts` with:

```ts
/** A focusable control's box (screen px). */
export interface NavRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type NavDir = 'up' | 'down' | 'left' | 'right';

/** How wide the cone off the beam is: a box's gap across the press at most this × the centres' distance along it. */
export const CONE = 0.5;
/** Edges this close (px) are level: a rounding never puts a neighbour "beyond". */
const EPS = 0.5;

/** How a box lies from the focused one, along the press and across it. */
interface Lay {
  /** The gap between the two boxes along the press (0 when they overlap). */
  along: number;
  /** Where the box ends along the press, from the focused box's edge. */
  far: number;
  /** The gap between them across the press (0 in the beam). */
  across: number;
  /** Their spans across the press overlap. */
  beam: boolean;
  /** Between their centres, across the press and along it. */
  offset: number;
  centre: number;
}

/** How `c` lies from `from` for a press of `dir`, or null when it is not beyond `from` that way. */
function lay(from: NavRect, c: NavRect, dir: NavDir): Lay | null {
  const sideways = dir === 'left' || dir === 'right';
  const forward = dir === 'right' || dir === 'down';
  // Each box's span along the press (a) and across it (b).
  const [fa0, fa1, ca0, ca1] = sideways
    ? [from.x, from.x + from.w, c.x, c.x + c.w]
    : [from.y, from.y + from.h, c.y, c.y + c.h];
  const [fb0, fb1, cb0, cb1] = sideways
    ? [from.y, from.y + from.h, c.y, c.y + c.h]
    : [from.x, from.x + from.w, c.x, c.x + c.w];
  const beyond = forward
    ? ca0 > fa0 + EPS && ca1 > fa1 + EPS
    : ca1 < fa1 - EPS && ca0 < fa0 - EPS;
  if (!beyond) return null;
  const along = Math.max(0, forward ? ca0 - fa1 : fa0 - ca1);
  return {
    along,
    far: along + (ca1 - ca0),
    across: Math.max(0, Math.max(fb0, cb0) - Math.min(fb1, cb1)),
    beam: Math.min(fb1, cb1) - Math.max(fb0, cb0) > EPS,
    offset: Math.abs((cb0 + cb1) / 2 - (fb0 + fb1) / 2),
    centre: Math.abs((ca0 + ca1) / 2 - (fa0 + fa1) / 2),
  };
}

/**
 * The control to move focus to. Only a box beyond the focused one's edge counts. Of those in
 * its beam (their spans across the press overlap) the nearest wins, a tie to the one more in
 * line; of those off it, only ones in a cone (`CONE`), the nearest by a distance that counts
 * the gap across twice. The beam's pick wins, unless the cone's lies wholly in a nearer row
 * and no further aside than the focused box is wide (a ragged, wrapped grid steps row by
 * row). Null at an edge: the focus never wraps.
 */
export function pickNext(from: NavRect, candidates: NavRect[], dir: NavDir): NavRect | null {
  let beam: { c: NavRect; l: Lay } | null = null;
  let cone: { c: NavRect; l: Lay; d: number } | null = null;
  for (const c of candidates) {
    if (c.id === from.id) continue;
    const l = lay(from, c, dir);
    if (!l) continue;
    if (l.beam) {
      if (!beam || l.along < beam.l.along || (l.along === beam.l.along && l.offset < beam.l.offset))
        beam = { c, l };
    } else if (l.across <= l.centre * CONE) {
      const d = l.along * l.along + 4 * l.across * l.across;
      if (!cone || d < cone.d) cone = { c, l, d };
    }
  }
  if (!beam) return cone?.c ?? null;
  if (!cone) return beam.c;
  const wide = dir === 'left' || dir === 'right' ? from.h : from.w;
  return cone.l.far <= beam.l.along && cone.l.across <= wide ? cone.c : beam.c;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/spatial-nav.test.ts)`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the navigation's own tests, which use `pickNext` through `moveFocus`**

Run: `(cd packages/client && npx vitest run src/features/gamepad)`
Expected: PASS. Their buttons sit on one row, 10 px wide: each neighbour is in the beam.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/gamepad/spatial-nav.ts packages/client/src/features/gamepad/__tests__/spatial-nav.test.ts
git commit -m "feat(client): the D-pad picks by edge, beam and cone

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: candidates, and the clipped rule

**Files:**
- Modify: `packages/client/src/features/gamepad/use-gamepad-nav.ts`
- Test: `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts`

- [ ] **Step 1: Write the failing tests**

In `use-gamepad-nav.test.ts`, change the import of the module under test to:

```ts
import {
  candidates,
  claimDevices,
  isCandidate,
  keepFocus,
  moveFocus,
  useGamepadNav,
} from '../use-gamepad-nav';
```

and add this block after the `describe('moveFocus between buttons', …)` block:

```ts
describe('candidates: a control scrolled out of its list', () => {
  afterEach(() => document.body.replaceChildren());
  /** `el` with a box `w` × `h` at `left`, `top`. */
  const at = <T extends HTMLElement>(el: T, left: number, top: number, w = 10, h = 10): T => {
    el.getBoundingClientRect = () =>
      ({ left, top, width: w, height: h, right: left + w, bottom: top + h }) as DOMRect;
    return el;
  };
  /**
   * A scrolling list 100 × 100 at 0, 0 holding a row in view (at its top) and one scrolled below
   * it, and a button outside, level with the hidden row.
   */
  const scene = () => {
    const list = at(document.body.appendChild(document.createElement('div')), 0, 0, 100, 100);
    list.style.overflowY = 'auto';
    const shown = at(list.appendChild(document.createElement('button')), 0, 0);
    const hidden = at(list.appendChild(document.createElement('button')), 0, 140);
    const outside = at(document.body.appendChild(document.createElement('button')), 200, 140);
    return { shown, hidden, outside };
  };

  it('is no candidate from outside the list, and is one from inside it', () => {
    const { shown, hidden, outside } = scene();
    expect(candidates(outside)).toEqual([shown, outside]);
    expect(candidates(shown)).toEqual([shown, hidden, outside]);
    expect(candidates(null)).toEqual([shown, outside]);
  });

  it('is never the D-pad\'s pick from outside, and is the next row from inside', () => {
    const { shown, hidden, outside } = scene();
    outside.focus();
    expect(isCandidate(hidden)).toBe(false);
    moveFocus('left');
    // The row scrolled out lies straight to the left: the press finds nothing there.
    expect(document.activeElement).toBe(outside);
    shown.focus();
    moveFocus('down');
    expect(document.activeElement).toBe(hidden);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/use-gamepad-nav.test.ts)`
Expected: FAIL: `candidates` and `isCandidate` are not exported.

- [ ] **Step 3: Write the rule**

In `packages/client/src/features/gamepad/use-gamepad-nav.ts`:

Export the list (it is the contract's `FOCUSABLE`):

```ts
// old
const FOCUSABLE =
  'button:not(:disabled), a[href], [role="tab"], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
// new
/** What the pad's focus can land on. */
export const FOCUSABLE =
  'button:not(:disabled), a[href], [role="tab"], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
```

Replace the `candidates` function:

```ts
// old
function candidates(): HTMLElement[] {
  return [...topScope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => visible(el) && !el.closest('[data-pad-skip]'),
  );
}
```

with:

```ts
/** The scroll containers around `el` (an ancestor under the body whose overflow is auto or scroll), nearest first. */
function scrollers(el: Element): Element[] {
  const out: Element[] = [];
  const page: Element[] = [document.body, document.documentElement];
  for (let p = el.parentElement; p && !page.includes(p); p = p.parentElement) {
    const s = getComputedStyle(p);
    if (/auto|scroll/.test(s.overflowX + s.overflowY)) out.push(p);
  }
  return out;
}

/** None of `el`'s box shows inside one of the scroll containers `around` it: it is scrolled out of view. */
function clipped(el: Element, around: Element[]): boolean {
  const b = el.getBoundingClientRect();
  return around.some((p) => {
    const c = p.getBoundingClientRect();
    return b.right <= c.left || b.left >= c.right || b.bottom <= c.top || b.top >= c.bottom;
  });
}

/**
 * The D-pad's candidates in the topmost scope, as seen from `active`: every visible focusable
 * control outside `[data-pad-skip]`, but one scrolled out of its list, which counts only from
 * inside that list (the D-pad walks a list row by row and scrolls it; from outside, its
 * hidden rows don't exist).
 */
export function candidates(active: Element | null = document.activeElement): HTMLElement[] {
  const home = active ? (scrollers(active)[0] ?? null) : null;
  return [...topScope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (!visible(el) || el.closest('[data-pad-skip]')) return false;
    const around = scrollers(el);
    return !clipped(el, around) || (home !== null && around[0] === home);
  });
}

/** True when the D-pad could land on `el` now. */
export function isCandidate(el: HTMLElement): boolean {
  return candidates().includes(el);
}
```

`keepFocus`, `moveFocus` and the A press already call `candidates()` with no argument: they now see the list from the focused control, which is what each wants.

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/gamepad)`
Expected: PASS, the two new tests among them. (In `'is never the D-pad's pick…'`, left from `outside` finds `shown` out of the cone, 130 px up for 200 px along, and `hidden` no candidate.)

- [ ] **Step 5: Types**

Run: `(cd packages/client && npx tsc --noEmit -p .)`
Expected: no errors. `TutorialHighlight.tsx` keeps its own copy of the list until plan 02.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/gamepad/use-gamepad-nav.ts packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts
git commit -m "feat(client): a control scrolled out of its list is no D-pad target from outside it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 2: groups, the kit, tabs

### Task 3: groups, with memory (`nextFocus`)

**Files:**
- Modify: `packages/client/src/features/gamepad/use-gamepad-nav.ts`
- Test: `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `nextFocus` to the test file's import from `'../use-gamepad-nav'`, and add this block after the `candidates` block:

```ts
describe('groups: the focus stays in a pane while it can, and comes back to where it left', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setDevice('keyboard');
  });
  const at = <T extends HTMLElement>(el: T, left: number, top: number, w = 10, h = 10): T => {
    el.getBoundingClientRect = () =>
      ({ left, top, width: w, height: h, right: left + w, bottom: top + h }) as DOMRect;
    return el;
  };
  /** A pane (a group) 100 × 200 at `left`, 0. */
  const pane = (left: number) => {
    const p = at(document.body.appendChild(document.createElement('div')), left, 0, 100, 200);
    p.setAttribute('data-pad-group', '');
    return p;
  };
  const button = (parent: HTMLElement, left: number, top: number) =>
    at(parent.appendChild(document.createElement('button')), left, top);
  /** Two panes side by side: `a1` above `a2` on the left; `b1` far down on the right, `b2` level with `a1`. */
  const scene = () => {
    const [a, b] = [pane(0), pane(200)];
    const [a1, a2] = [button(a, 80, 0), button(a, 80, 100)];
    const [b1, b2] = [button(b, 200, 180), button(b, 200, 0)];
    return { a1, a2, b1, b2 };
  };

  it('picks inside the group first: a nearer control in the next pane waits', () => {
    const { a1, a2, b1 } = scene();
    // b1 is nearer a2's row than a1 is, but down from a1 stays in the pane.
    expect(nextFocus(a1, 'down')).toBe(a2);
    expect(nextFocus(b1, 'up')).not.toBe(a2);
  });

  it('crosses to the pane that lies that way, even when none of its controls lines up', () => {
    const { a2, b1, b2 } = scene();
    // Nothing of the right pane is in a2's row or its cone; the pane's box is.
    b2.remove();
    expect(nextFocus(a2, 'right')).toBe(b1);
  });

  it('enters a pane at the control in line, and with a memory at the one it last held', () => {
    const { a1, a2, b1, b2 } = scene();
    expect(nextFocus(a1, 'right')).toBe(b2);
    // The player was on b1, then went left and comes back.
    b1.focus();
    keepFocus();
    a1.focus();
    keepFocus();
    expect(nextFocus(a1, 'right')).toBe(b1);
    expect(nextFocus(a1, 'right', { memory: false })).toBe(b2);
    // And the way back lands on a1, whatever lies level with b1.
    b1.focus();
    moveFocus('left');
    expect(document.activeElement).toBe(a1);
    expect(nextFocus(b1, 'left', { memory: false })).toBe(a2);
  });

  it('a control in no group is a group of one', () => {
    const lone = at(document.body.appendChild(document.createElement('button')), 400, 0);
    const { b2 } = scene();
    expect(nextFocus(b2, 'right')).toBe(lone);
    expect(nextFocus(lone, 'left')).toBe(b2);
  });

  it('under the pad, a vanished control passes the focus to the nearest one in its pane', () => {
    setDevice('gamepad');
    const { a1, a2, b2 } = scene();
    // With a2 moved to the pane's foot, b2 (120 px from a1) is nearer than a2 (190 px): the pane still wins.
    at(a2, 80, 190);
    a1.focus();
    keepFocus();
    a1.remove();
    keepFocus();
    expect(document.activeElement).toBe(a2);
    expect(document.activeElement).not.toBe(b2);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/use-gamepad-nav.test.ts)`
Expected: FAIL: `nextFocus` is not exported.

- [ ] **Step 3: Write the groups**

In `use-gamepad-nav.ts`:

Extend the module's doc comment (the block above `FOCUSABLE`): replace its first sentence's clause

```
 * Controller navigation for every screen outside live combat: D-pad (or a
 * left-stick flick) moves focus to the nearest control in that direction
 * (left/right adjust a focused slider or list), A presses it. Every other
```

with

```
 * Controller navigation for every screen outside live combat: D-pad (or a
 * left-stick flick) moves focus to the control lying that way (`nextFocus`:
 * inside its `[data-pad-group]` pane while one does, else into the pane that
 * way, at the control it last held; never onto one scrolled out of its list;
 * left/right adjust a focused slider or list), A presses it. Every other
```

Replace the `lastFocus` declaration:

```ts
// old
/** The focus last seen in each scope, and where it was (it may have gone since). */
const lastFocus = new WeakMap<HTMLElement | Document, { el: HTMLElement; at: DOMRect }>();
// new
/** A control's group: its nearest `[data-pad-group]` (a pane), else itself, a group of one. */
function groupOf(el: HTMLElement): Element {
  return el.closest('[data-pad-group]') ?? el;
}

/** The focus last seen in each scope, where it was and in which group (it may have gone since). */
const lastFocus = new WeakMap<
  HTMLElement | Document,
  { el: HTMLElement; at: DOMRect; group: Element }
>();
/** The control each group last held: coming back into a pane lands where it was left. */
const groupFocus = new WeakMap<Element, HTMLElement>();
```

In `keepFocus`, replace the remembering branch and the nearest fallback:

```ts
// old
    lastFocus.set(s, { el: active, at: active.getBoundingClientRect() });
    return;
// new
    const group = groupOf(active);
    lastFocus.set(s, { el: active, at: active.getBoundingClientRect(), group });
    groupFocus.set(group, active);
    return;
```

```ts
// old
  focus(els.reduce((best, el) => (dist(el) < dist(best) ? el : best)));
// new
  // Its own pane first: a row that went leaves the focus on its neighbour, not across the screen.
  const near = els.filter((el) => groupOf(el) === last.group);
  focus((near.length ? near : els).reduce((best, el) => (dist(el) < dist(best) ? el : best)));
```

Also update `keepFocus`'s doc comment: change "else the one nearest where it\n * was," to "else the one nearest where it\n * was (in its pane, if any is left there),".

Replace `rectOf` and add the gap and `nextFocus` (keep `focus`, `nudgeRange` and `stepSelect` as they are):

```ts
// old
function rectOf(el: HTMLElement, i: number): NavRect {
  const r = el.getBoundingClientRect();
  return { id: String(i), x: r.left, y: r.top, w: r.width, h: r.height };
}
// new
function rectOf(el: Element, i: number): NavRect {
  const r = el.getBoundingClientRect();
  return { id: String(i), x: r.left, y: r.top, w: r.width, h: r.height };
}

/** The gap between two boxes (0 when they touch or overlap). */
function gapBetween(a: DOMRect, b: DOMRect): number {
  const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  return Math.hypot(dx, dy);
}

/**
 * The control a press of `dir` on `el` would focus, or null at an edge. Inside `el`'s group
 * while one of its controls lies that way (`pickNext`); else in the group whose box lies that
 * way, at the control it last held, else at the pick among its controls, else at its nearest.
 * `memory: false` leaves the last-held control out: the picks alone (tests, the audit).
 */
export function nextFocus(
  el: HTMLElement,
  dir: NavDir,
  { memory = true }: { memory?: boolean } = {},
): HTMLElement | null {
  const els = candidates(el).filter((c) => c !== el);
  const from = rectOf(el, -1);
  const pick = <T extends Element>(pool: T[]): T | null => {
    const next = pickNext(from, pool.map(rectOf), dir);
    return next ? pool[Number(next.id)] : null;
  };
  const home = groupOf(el);
  const inside = pick(els.filter((c) => groupOf(c) === home));
  if (inside) return inside;
  const group = pick([...new Set(els.filter((c) => groupOf(c) !== home).map(groupOf))]);
  if (!group) return null;
  const members = els.filter((c) => groupOf(c) === group);
  const held = memory ? groupFocus.get(group) : undefined;
  if (held && members.includes(held)) return held;
  const here = el.getBoundingClientRect();
  const gap = (c: HTMLElement) => gapBetween(here, c.getBoundingClientRect());
  return pick(members) ?? members.reduce((best, c) => (gap(c) < gap(best) ? c : best));
}
```

Replace the end of `moveFocus`:

```ts
// old
  const els = candidates();
  if (els.length === 0) return;
  const idx = els.indexOf(document.activeElement as HTMLElement);
  if (idx < 0) return focus(els[0]);
  const rects = els.map(rectOf);
  const next = pickNext(rects[idx], rects, dir);
  if (next) focus(els[Number(next.id)]);
}
// new
  const els = candidates();
  if (els.length === 0) return;
  if (!(active instanceof HTMLElement) || !els.includes(active)) return focus(els[0]);
  const next = nextFocus(active, dir);
  if (next) focus(next);
}
```

(`active` is the `const active = document.activeElement;` already at the top of `moveFocus`.)

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/gamepad)`
Expected: PASS, the five new tests among them, and every earlier one (their controls sit in no group: each is a group of one, and the pick among those is the old flat pick).

- [ ] **Step 5: Types, then commit**

Run: `(cd packages/client && npx tsc --noEmit -p .)` (expected: no errors; if `NavRect` is now unused as an import type in a file, remove that import).

```bash
git add packages/client/src/features/gamepad/use-gamepad-nav.ts packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts
git commit -m "feat(client): the D-pad keeps to a pane and comes back to where it left

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: the kit marks the panes, and its tabs leave the D-pad

**Files:**
- Modify: `packages/client/src/features/delve/kit/surfaces.tsx` (`Panel`, `Header`, `Footer`)
- Modify: `packages/client/src/features/delve/kit/controls.tsx` (`Tabs`)
- Test: `packages/client/src/features/delve/kit/__tests__/surfaces.test.tsx`, `controls.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `surfaces.test.tsx`, inside `describe('the kit surfaces', …)`, add:

```tsx
  it('marks a plate, a glass panel, the header and the footer as pad groups, never a well', () => {
    render(
      <>
        <Panel testId="plate">a</Panel>
        <Panel material="glass" testId="glass">
          b
        </Panel>
        <Panel material="well" testId="well">
          c
        </Panel>
        <Header title="The Anvil" />
        <Footer prompts={[]}>
          <button type="button">Delve</button>
        </Footer>
      </>,
    );
    expect(screen.getByTestId('plate')).toHaveAttribute('data-pad-group');
    expect(screen.getByTestId('glass')).toHaveAttribute('data-pad-group');
    expect(screen.getByTestId('well')).not.toHaveAttribute('data-pad-group');
    expect(screen.getByText('The Anvil').closest('[data-pad-group]')).toHaveClass('k-header');
    expect(screen.getByText('Delve').closest('[data-pad-group]')).toHaveClass('k-footer');
  });
```

In `controls.test.tsx`, inside `describe('the kit controls', …)`, add:

```tsx
  it('keeps its tabs off the D-pad: LB/RB and LT/RT step them', () => {
    const { rerender } = render(
      <Tabs tabs={[...TABS]} value="loadout" onChange={() => {}} level="top" />,
    );
    expect(screen.getByRole('tablist')).toHaveAttribute('data-pad-skip');
    rerender(<Tabs tabs={[...TABS]} value="loadout" onChange={() => {}} level="sub" />);
    expect(screen.getByRole('tablist')).toHaveAttribute('data-pad-skip');
  });
```

(If `Tabs` in this file's other tests takes more required props, copy them from the nearest existing `render(<Tabs …` call.)

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/surfaces.test.tsx src/features/delve/kit/__tests__/controls.test.tsx)`
Expected: FAIL on the two new tests: no `data-pad-group`, no `data-pad-skip`.

- [ ] **Step 3: Set the attributes**

`surfaces.tsx`, in `Panel` (and extend its doc comment with "A plate or a glass panel is a pad group (`data-pad-group`): the D-pad keeps to it while it can."):

```tsx
// old
      aria-labelledby={title !== undefined && !rest['aria-label'] ? titleId : undefined}
      data-testid={testId}
    >
// new
      aria-labelledby={title !== undefined && !rest['aria-label'] ? titleId : undefined}
      data-testid={testId}
      data-pad-group={material === 'well' ? undefined : ''}
    >
```

`surfaces.tsx`, in `Header`:

```tsx
// old
    <div className="k-header">
// new
    <div className="k-header" data-pad-group="">
```

`surfaces.tsx`, in `Footer`:

```tsx
// old
    <div className="k-footer">
// new
    <div className="k-footer" data-pad-group="">
```

`controls.tsx`, in `Tabs` (and add to its doc comment: "The D-pad never lands on a tab (`data-pad-skip`): LB/RB step the top level and LT/RT the sub level."):

```tsx
// old
      className="k-tabs"
      data-pad-tabs={level === 'sub' ? 'sub' : ''}
    >
// new
      className="k-tabs"
      data-pad-tabs={level === 'sub' ? 'sub' : ''}
      data-pad-skip=""
    >
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/kit)`
Expected: PASS.

- [ ] **Step 5: Find what else relied on a kit tab being a D-pad stop**

Run: `(cd packages/client && npx vitest run)`
Expected: failures only where a test walks the D-pad onto a kit tab or expects LB/RB to leave the focus on one. Task 5 changes that behaviour: list the failing tests now, and do not fix them yet (if a failure is unrelated to tabs or groups, stop and read it: it is a regression of Tasks 1 to 3).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/delve/kit/surfaces.tsx packages/client/src/features/delve/kit/controls.tsx packages/client/src/features/delve/kit/__tests__/surfaces.test.tsx packages/client/src/features/delve/kit/__tests__/controls.test.tsx
git commit -m "feat(client): the kit's panes are pad groups and its tabs leave the D-pad

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: stepping tabs puts the focus in the content

**Files:**
- Modify: `packages/client/src/features/gamepad/use-gamepad-nav.ts` (`stepTabs`)
- Modify: `packages/client/src/pages/DelveTraining.tsx`
- Test: `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts`, `packages/client/src/pages/__tests__/DelveTraining.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `use-gamepad-nav.test.ts`, inside `describe('the pad outside combat: scopes, tab lists and prompts', …)`, after the test `'RB steps the top-level tabs and RT the sub list, both past disabled tabs'` (which must keep passing unchanged: its lists are not skipped, so their tabs take the focus as now), add:

```ts
  it('a skipped tab list (the kit\'s) puts the focus in the content, or leaves it where it survived', () => {
    const list = el('div', { role: 'tablist', 'data-pad-tabs': '', 'data-pad-skip': '' });
    const main = el('div');
    const foot = el('div', { 'data-screen-section': 'screen-foot' });
    const delve = el('button', {}, foot, 0, 100);
    /** Each tab swaps the main's content for its own two controls. */
    const tab = (name: string, selected: boolean) => {
      const t = el('button', { role: 'tab', 'aria-selected': String(selected) }, list);
      t.addEventListener('click', () => {
        for (const o of list.querySelectorAll('[role="tab"]')) o.setAttribute('aria-selected', 'false');
        t.setAttribute('aria-selected', 'true');
        main.replaceChildren();
        el('button', { 'data-name': `${name}-first` }, main, 0, 20);
        el('button', { 'data-name': `${name}-second` }, main, 0, 40);
      });
      return t;
    };
    const [, forge] = [tab('loadout', true), tab('forge', false)];
    const stale = el('button', {}, main, 0, 20);
    const name = () => (document.activeElement as HTMLElement).getAttribute('data-name');
    // The focused control goes with the old tab: the new tab's first control takes the focus.
    stale.focus();
    tap(PAD.rb);
    expect(forge.getAttribute('aria-selected')).toBe('true');
    expect(name()).toBe('forge-first');
    // The focused control survives the switch (the footer's): it keeps the focus.
    delve.focus();
    tap(PAD.rb);
    expect(name()).toBeNull();
    expect(document.activeElement).toBe(delve);
    // And the D-pad never lands on a tab.
    (main.firstElementChild as HTMLElement).focus();
    tap(PAD.up);
    expect((document.activeElement as HTMLElement).getAttribute('role')).not.toBe('tab');
  });
```

`PAD` in that file has no `up`: add `up: 12` to it (`const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, menu: 9, up: 12, right: 15 } as const;`).

In `pages/__tests__/DelveTraining.test.tsx`, make the mocked dock's tab list a kit one and expect the focus in the content:

```tsx
// old
        <div role="tablist" data-pad-tabs="">
// new
        <div role="tablist" data-pad-tabs="" data-pad-skip="">
```

```tsx
// old
    expect(screen.getByRole('tab', { name: 'Targets' })).toHaveFocus();
// new
    // Never on a tab (LB/RB step those): the dock's first control.
    expect(screen.getByRole('button', { name: 'Socket 1' })).toHaveFocus();
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/use-gamepad-nav.test.ts src/pages/__tests__/DelveTraining.test.tsx)`
Expected: FAIL: after RB the focus is on the tab (`name()` is null where `'forge-first'` is expected); the dock focuses nothing it can find or the tab.

- [ ] **Step 3: Write `stepTabs`' three outcomes**

In `use-gamepad-nav.ts`, replace the end of `stepTabs` and add the helper above it:

```ts
/** The first candidate after `mark` in document order, outside the screen's footer. */
function firstAfter(mark: Element): HTMLElement | null {
  return (
    candidates(null).find(
      (el) =>
        mark.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING &&
        !el.closest('[data-screen-section="screen-foot"]'),
    ) ?? null
  );
}
```

```ts
// old
  tabs[i].click();
  focus(tabs[i]);
}
// new
  const before = document.activeElement;
  tabs[i].click();
  // A list that is also a pane's content (the Skills tab's skill list): its row takes the focus.
  if (isCandidate(tabs[i])) return focus(tabs[i]);
  // A kit tab list is off the D-pad. A focused control that survived the switch keeps the focus;
  // else the new tab's first control takes it.
  if (before instanceof HTMLElement && before.isConnected && isCandidate(before)) return;
  const first = firstAfter(list);
  if (first) focus(first);
}
```

And `stepTabs`' doc comment:

```ts
// old
/** Step the topmost scope's tab list (LB/RB its top level, LT/RT its sub list), past disabled tabs. */
// new
/**
 * Step the topmost scope's tab list (LB/RB its top level, LT/RT its sub list), past disabled
 * tabs. The focus never rests on a tab the D-pad can't reach: it stays where it survived, else
 * goes to the new tab's first control.
 */
```

In the module's doc comment, after "LB/RB step its top-level `[data-pad-tabs]` and LT/RT its\n * `[data-pad-tabs="sub"]`, past disabled tabs." add " A stepped tab takes the focus only where tabs are D-pad stops (the skill list); a kit tab list puts it in the content."

- [ ] **Step 4: The Training dock focuses its first control**

In `packages/client/src/pages/DelveTraining.tsx`:

```tsx
// old
  // The dock takes the pad's focus on its selected tab, and gives it up when the pad leaves.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (padFocus)
      dock?.querySelector<HTMLElement>('[data-pad-tabs] [aria-selected="true"]')?.focus();
// new
  // The dock takes the pad's focus on its first control (never a tab: LB/RB step those), and
  // gives it up when the pad leaves.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (padFocus)
      [...(dock?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
        .find((el) => !el.closest('[data-pad-skip]'))
        ?.focus();
```

and import the list: add `FOCUSABLE` to an existing import from `'@/features/gamepad/use-gamepad-nav'` if the file has one, else add `import { FOCUSABLE } from '@/features/gamepad/use-gamepad-nav';`. Update the page's doc comment where it says the dock gets the focus "on its selected tab" (search the file for that phrase) to "on its first control".

- [ ] **Step 5: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/gamepad src/pages/__tests__/DelveTraining.test.tsx)`
Expected: PASS.

- [ ] **Step 6: The whole client, and the tests that encoded the old rules**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`

Expected: no type errors. For each test still failing from Task 4's list, the change is one of these and nothing else:
- it expected a kit tab to have the focus after LB/RB or LT/RT → expect the content's first control (or the control that survived);
- it walked the D-pad through a kit tab → walk around it (the tab is no longer a stop).

A failure that is neither means the rule is wrong, not the test: stop and read it. Fix them, re-run until the counts match the baseline plus this plan's new tests.

- [ ] **Step 7: Commit**

```bash
git add -A packages/client/src
git commit -m "feat(client): stepping tabs puts the pad's focus in the content

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 3: the audit

### Task 6: the audit and the walks (`e2e/delve-pad-nav.spec.ts`)

**Files:**
- Create: `packages/client/e2e/delve-pad-nav.spec.ts`

The file name matches `delve*.spec.ts`, so it runs in the `desktop` (1280×800) and `desktop-1080` projects.

- [ ] **Step 1: Write the spec**

Create `packages/client/e2e/delve-pad-nav.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import {
  createDefaultRegistry,
  defaultMoveset,
  economySim,
  generateItem,
  SeededRNG,
  type DataRegistry,
  type GearItem,
} from '@alloy/engine';
import { SAVE_KEY } from './fixtures/delve';

/**
 * The D-pad's whole map on the hub's screens (see the pad navigation spec, §1 and §3): on a
 * mid-game save with a filled bag, every control is reachable, none is reached while scrolled
 * out of another list, and the moves inside a pane reverse but for a recorded allowance; then
 * three walks with a fake pad through the screens that felt worst.
 */

const BUTTON = { a: 0, b: 1, lb: 4, rb: 5, lt: 6, rt: 7, up: 12, down: 13, left: 14, right: 15 } as const;
type Dir = 'up' | 'down' | 'left' | 'right';

/**
 * Moves inside a pane that don't reverse, per screen: [1280×800, 1920×1080]. A ratchet: ragged
 * layout (a wide control under two columns, a short last row) can't reverse, and a change that
 * adds to it must be looked at. Lower a number when the layout improves; never raise one
 * without reading the new moves (run with NAV_REPORT=1 to print them).
 */
const ALLOW: Record<string, [number, number]> = {
  loadout: [12, 12],
  'loadout-item': [14, 14],
  skills: [4, 4],
  forge: [14, 14],
  'forge-pattern': [20, 20],
  temper: [18, 18],
  codex: [0, 0],
  quests: [0, 0],
  'system-menu': [1, 1],
  settings: [9, 9],
};

/** A dozen bag items of mixed slots and rarities, two of them weapons. */
function bagOf(registry: DataRegistry): GearItem[] {
  const slots = ['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring', 'amulet'] as const;
  const rarities = ['common', 'uncommon', 'magic', 'rare', 'epic'] as const;
  return Array.from({ length: 12 }, (_, i) => {
    const slot = slots[i % slots.length];
    const item = generateItem(
      registry,
      {
        uid: `audit-${i}`,
        ilvl: 4,
        rarity: rarities[i % rarities.length],
        slot,
        mana: i % 2 ? 'fire' : 'frost',
      },
      new SeededRNG(100 + i),
    );
    return slot === 'weapon' ? { ...item, moveset: defaultMoveset(registry, item, 'fire') } : item;
  });
}

/** A mid-game save (three dives of the autopilot) with a filled bag, and a fake pad to press. */
async function seed(page: Page): Promise<void> {
  const registry = createDefaultRegistry();
  const sim = economySim(registry, 1, 3).profile;
  const save = JSON.stringify({ ...sim, bag: [...sim.bag, ...bagOf(registry)] });
  await page.addInitScript(
    ([key, value]) => {
      const w = window as unknown as { __pad: unknown };
      w.__pad = {
        connected: true,
        mapping: 'standard',
        index: 0,
        id: 'Fake Xbox controller',
        timestamp: 0,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: null,
      };
      navigator.getGamepads = () => [w.__pad as Gamepad];
      if (sessionStorage.getItem('pad-nav-e2e')) return;
      localStorage.clear();
      localStorage.setItem(key, value);
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('pad-nav-e2e', '1');
    },
    [SAVE_KEY, save] as const,
  );
}

/** Press and release within the page, across frames: the pad is read once a frame. */
async function tap(page: Page, button: number): Promise<void> {
  await page.evaluate(
    (i) =>
      new Promise<void>((resolve) => {
        const pad = (
          window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }
        ).__pad;
        pad.buttons[i] = { pressed: true, value: 1 };
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            pad.buttons[i] = { pressed: false, value: 0 };
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
        );
      }),
    button,
  );
}

interface Report {
  stops: number;
  unreachable: string[];
  clipped: string[];
  unreversed: string[];
}

/** The topmost scope's whole D-pad map, by the page's own rule with the memory off. */
async function audit(page: Page): Promise<Report> {
  return page.evaluate(async () => {
    const nav = await import('/src/features/gamepad/use-gamepad-nav.ts' as string);
    const prompts = await import('/src/features/delve/kit/prompts.ts' as string);
    const scope = prompts.topScope() as HTMLElement | Document;
    const shown = (el: HTMLElement) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    // Every stop, the rows scrolled out of their lists too: each must be reachable by walking.
    const all = [...scope.querySelectorAll<HTMLElement>(nav.FOCUSABLE)].filter(
      (el) => shown(el) && !el.closest('[data-pad-skip]'),
    );
    const label = (el: HTMLElement) =>
      `#${all.indexOf(el)} ${
        el.getAttribute('data-testid') ??
        el.getAttribute('aria-label') ??
        (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 20)
      }`;
    const scroller = (el: Element): Element | null => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/auto|scroll/.test(s.overflowX + s.overflowY)) return p;
      }
      return null;
    };
    const outOfView = (el: Element): boolean => {
      const p = scroller(el);
      if (!p) return false;
      const [b, c] = [el.getBoundingClientRect(), p.getBoundingClientRect()];
      return b.right <= c.left || b.left >= c.right || b.bottom <= c.top || b.top >= c.bottom;
    };
    const groupOf = (el: HTMLElement) => el.closest('[data-pad-group]') ?? el;
    const dirs = ['up', 'down', 'left', 'right'] as const;
    const opp = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
    /** A press from `el`, scrolled into view as focusing it would. A slider or a list takes left/right itself. */
    const next = (el: HTMLElement, d: (typeof dirs)[number]): HTMLElement | null => {
      const own = el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === 'range');
      if (own && (d === 'left' || d === 'right')) return null;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return nav.nextFocus(el, d, { memory: false });
    };
    const clipped: string[] = [];
    const unreversed: string[] = [];
    for (const el of all) {
      for (const d of dirs) {
        const to = next(el, d);
        if (!to) continue;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (outOfView(to) && scroller(to) !== scroller(el)) clipped.push(`${label(el)} ${d} ${label(to)}`);
        if (groupOf(to) !== groupOf(el)) continue;
        const back = next(to, opp[d]);
        if (back !== el) unreversed.push(`${label(el)} ${d} ${label(to)}, back ${back ? label(back) : 'nowhere'}`);
      }
    }
    const start = all.find((el) => el === document.activeElement) ?? all.find((el) => !outOfView(el))!;
    const seen = new Set<HTMLElement>([start]);
    const queue = [start];
    while (queue.length) {
      const el = queue.pop()!;
      for (const d of dirs) {
        const to = next(el, d);
        if (to && !seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    return {
      stops: all.length,
      unreachable: all.filter((el) => !seen.has(el)).map(label),
      clipped,
      unreversed,
    };
  });
}

/** Audit the screen now showing as `name` and hold it to the rules. */
async function check(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(300);
  const r = await audit(page);
  const wide = test.info().project.name === 'desktop-1080' ? 1 : 0;
  if (process.env.NAV_REPORT)
    console.log(`${name} (${test.info().project.name}): ${r.stops} stops, ${r.unreversed.length} unreversed\n  ${r.unreversed.join('\n  ')}`);
  expect(r.stops, `${name} has stops`).toBeGreaterThan(1);
  expect(r.unreachable, `${name}: every stop is reachable`).toEqual([]);
  expect(r.clipped, `${name}: no move lands on a row scrolled out of another list`).toEqual([]);
  expect(r.unreversed.length, `${name}: moves inside a pane that don't reverse\n${r.unreversed.join('\n')}`).toBeLessThanOrEqual(ALLOW[name][wide]);
}

const click = (page: Page, id: string) => page.getByTestId(id).first().click();

/** Where the focus is: its test id, its group's (pane's) test id or class, and whether it is in the footer. */
async function where(page: Page): Promise<{ id: string; group: string; foot: boolean; tab: boolean }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const g = el.closest('[data-pad-group]') ?? el;
    return {
      id: el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 20) ?? '',
      group: g.getAttribute('data-testid') ?? g.className,
      foot: !!el.closest('[data-screen-section="screen-foot"]'),
      tab: el.getAttribute('role') === 'tab' && !!el.closest('[data-pad-skip]'),
    };
  });
}

/** Mark the focused control, so a walk can tell it came back to it. */
const mark = (page: Page, name: string) =>
  page.evaluate((n) => (document.activeElement as HTMLElement).setAttribute('data-walk', n), name);
const marked = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('data-walk'));

/**
 * Press `dir` until the focus is in another group (at most `max` presses); the last control it
 * held in this one is marked `name`. Returns the group left.
 */
async function leave(page: Page, dir: Dir, name: string, max = 8): Promise<string> {
  const from = (await where(page)).group;
  for (let i = 0; i < max; i++) {
    await mark(page, name);
    await tap(page, BUTTON[dir]);
    if ((await where(page)).group !== from) return from;
    // Still inside: the newly focused control is the one a return must find.
    await page.evaluate((n) => {
      for (const el of document.querySelectorAll(`[data-walk="${n}"]`))
        if (el !== document.activeElement) el.removeAttribute('data-walk');
    }, name);
  }
  throw new Error(`${dir} never left ${from}`);
}

/** Press `dir` until the focus is back on a control marked `name` (at most `max` presses). */
async function back(page: Page, dir: Dir, name: string, max = 6): Promise<void> {
  for (let i = 0; i < max; i++) {
    await tap(page, BUTTON[dir]);
    if ((await marked(page)) === name) return;
  }
  expect(await marked(page), `${dir} comes back to where the pane was left`).toBe(name);
}

test.describe('Delve pad navigation', () => {
  test('PN01: every hub screen is walkable: all reachable, none clipped, panes reverse', async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page);
    await page.goto('/delve');
    await expect(page.getByTestId('delve-button')).toBeVisible();
    await check(page, 'loadout');
    await click(page, 'bag-item');
    await check(page, 'loadout-item');
    await click(page, 'tab-skills');
    await check(page, 'skills');
    await click(page, 'tab-forge');
    await check(page, 'forge');
    await click(page, 'pattern-cuirass');
    await check(page, 'forge-pattern');
    await page.getByRole('tab', { name: /Temper/ }).click();
    await check(page, 'temper');
    await click(page, 'tab-codex');
    await check(page, 'codex');
    await click(page, 'tab-quests');
    await check(page, 'quests');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('open-settings')).toBeVisible();
    await check(page, 'system-menu');
    await click(page, 'open-settings');
    await check(page, 'settings');
  });

  test('PN02: Loadout: out of the bag and back lands on the same tile, by the side and by the footer', async ({ page }) => {
    await seed(page);
    await page.goto('/delve');
    await page.getByTestId('bag-item').nth(4).focus();
    // The pad takes the input lock with a D-pad press (A on a tile would equip it).
    await tap(page, BUTTON.up);
    await leave(page, 'right', 'tile');
    expect((await where(page)).foot).toBe(false);
    await back(page, 'left', 'tile');
    const bag = await leave(page, 'down', 'low');
    expect((await where(page)).foot).toBe(true);
    // Up from the footer goes into the pane above the focused button: when that is the bag, to
    // the control it was left on.
    await tap(page, BUTTON.up);
    const at = await where(page);
    expect(at.foot).toBe(false);
    if (at.group === bag) expect(await marked(page)).toBe('low');
  });

  test('PN03: Skills: the list, the cards and the inspector, and back to the same card', async ({ page }) => {
    await seed(page);
    await page.goto('/delve');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    // LB/RB never leave the focus on a tab.
    expect((await where(page)).tab).toBe(false);
    await page.getByTestId('chain-skill-primary').focus();
    await leave(page, 'right', 'row');
    expect((await where(page)).foot).toBe(false);
    await leave(page, 'right', 'card');
    expect((await where(page)).foot).toBe(false);
    await back(page, 'left', 'card');
    await back(page, 'left', 'row');
  });

  test('PN04: Forge and Temper: pattern, bench, materials and back; LT/RT lands in the bench', async ({ page }) => {
    await seed(page);
    await page.goto('/delve');
    await click(page, 'tab-forge');
    await click(page, 'pattern-cuirass');
    await page.getByTestId('pattern-cuirass').focus();
    await tap(page, BUTTON.up); // the pad takes the input lock (and moves within the list)
    await page.getByTestId('pattern-cuirass').focus();
    await leave(page, 'right', 'pattern');
    await leave(page, 'right', 'bench');
    await back(page, 'left', 'bench');
    await back(page, 'left', 'pattern');
    // RT steps to Temper: the pattern list goes, and the focus lands on a control of the bench.
    await tap(page, BUTTON.rt);
    await expect(page.getByRole('tab', { name: /Temper/ })).toHaveAttribute('aria-selected', 'true');
    const at = await where(page);
    expect(at.tab).toBe(false);
    expect(at.foot).toBe(false);
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  });
});
```

- [ ] **Step 2: Check the test ids the spec leans on still exist**

Run: `(cd packages/client && grep -rn "bag-item\|pattern-cuirass\|chain-skill-primary\|open-settings\|delve-button" src --include=*.tsx -l | head)` and, for `pattern-cuirass`, `grep -n 'pattern-\${' src/features/delve/hub/forge/PatternList.tsx`.
Expected: each id is rendered (the pattern rows as `` `pattern-${b.id}` ``). If one was renamed, use its new name in the spec.

- [ ] **Step 3: Run it at 1080p and read the report**

Run: `(cd packages/client && NAV_REPORT=1 npx playwright test e2e/delve-pad-nav.spec.ts --project=desktop-1080)`

Expected: PN01 to PN04 pass. PN01's numbers at 1080p should be at or under the table's second column (the prototype's: 12, 14, 4, 14, 20, 18, 0, 0, 1, 9).

If PN01 fails:
- **unreachable** or **clipped** is a bug in Tasks 1 to 4, not an allowance to raise. Read the named controls: an unreachable one is usually a control outside every group that no group's box points at, or a group whose `data-pad-group` is missing (a pane built without the kit's `Panel`: give its root `data-pad-group=""`).
- **unreversed over the allowance**: read the printed moves. If they are ragged layout (the spec's §1.1 says which kinds), set that screen's number to the measured one. If a move is plainly wrong (a diagonal jump across a pane), it is a rule bug.

If a walk (PN02 to PN04) fails because a pane has nothing focusable on that side on this save, pick the next direction that has (the walk's point is leave-and-return), and say so in a comment.

- [ ] **Step 4: Run it at 1280×800 and record that column**

Run: `(cd packages/client && NAV_REPORT=1 npx playwright test e2e/delve-pad-nav.spec.ts --project=desktop)`

Expected: unreachable and clipped empty on every screen. Set each screen's first number in `ALLOW` to the measured count (the same reading as step 3 applies: ragged layout only). Re-run both projects: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/delve-pad-nav.spec.ts
git commit -m "test(client): the D-pad's map of the hub is audited: reachable, unclipped, reversible in a pane

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: the pad's older E2E walks

**Files:**
- Modify: `packages/client/e2e/delve-gamepad.spec.ts`

- [ ] **Step 1: Run it**

Run: `(cd packages/client && npx playwright test e2e/delve-gamepad.spec.ts --project=desktop)`

- [ ] **Step 2: Update only what encoded the old picks**

`padWalk`'s comment describes the old rule ("right from the lane's last card meets the header's tabs before the inspector"). Replace the comment's last sentence with: "The pad's rule decides each step (inside a pane while it can, then into the pane that way), so the walk takes what the rule gives."

For each failing test, the allowed changes are:
- **G06 / G07** focus the skill list's rows with LT/RT and step right into the lane: these must pass **unchanged** but for one thing. In G07, `await tap(page, BUTTON.right)` from the Primary's row expects `socket-0`; the lane is now entered at the control in line with the row, which may be the card (`move-0`). If so, change that expectation to `move-0` and add one `await tap(page, BUTTON.down);` before `await expect(page.getByTestId('socket-0')).toBeFocused();`, in both places the test makes that walk.
- A walk that pressed up into the header's tabs, or expected a kit tab focused after LB/RB: the tab is no stop now; expect the content's first control, or drop the detour.
- Anything else failing is a regression: stop and read it.

- [ ] **Step 3: Run both projects**

Run: `(cd packages/client && npx playwright test e2e/delve-gamepad.spec.ts)`
Expected: PASS in `desktop` and `desktop-1080`.

- [ ] **Step 4: The other Delve E2E still pass**

Run: `(cd packages/client && npx playwright test --project=desktop --grep-invert "TU01")`
Expected: PASS (TU01 is slow and belongs to plans 02 and 03; nothing in this plan touches what it drives with the mouse).

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/delve-gamepad.spec.ts
git commit -m "test(client): the pad's walks follow the new picks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Done when

- `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` is green: the baseline's tests plus this plan's.
- `e2e/delve-pad-nav.spec.ts` and `e2e/delve-gamepad.spec.ts` pass in `desktop` and `desktop-1080`.
- `use-gamepad-nav.ts` exports what `00-overview.md`'s "From 01" contract lists.
