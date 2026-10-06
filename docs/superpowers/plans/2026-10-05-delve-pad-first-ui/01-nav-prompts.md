# Prompt order and wrapping lists Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every footer draws its prompts in one order, a dialog's list wraps at its ends, and a stepped tab can say where the focus lands.

**Architecture:** a pure `orderPrompts` in the kit's prompt module that `PromptBar` draws through; a `wrapFocus` fallback in `moveFocus`, keyed on a `[data-pad-wrap]` container (the kit `Dialog`'s `wrap`), leaving `nextFocus` (and so the pad audit) unchanged; `stepTabs` prefers the new tab's `[data-pad-first]`.

**Tech Stack:** React 19, TypeScript, Vitest (jsdom).

Read `00-overview.md` first (branch, commands, conventions). Spec: sections 1 (rule 3), 2.3 ("The pad lands on it"), 2.4 and 2.5.

---

### Task 1: `orderPrompts`

**Files:**
- Modify: `packages/client/src/features/delve/kit/prompts.ts`
- Modify: `packages/client/src/features/delve/kit/glyphs.tsx` (`PromptBar`)
- Test: `packages/client/src/features/delve/kit/__tests__/prompts.test.ts`, `glyphs.test.tsx`

- [ ] **Step 1: Write the failing tests** (append to `prompts.test.ts`; import `orderPrompts` with the file's other imports)

```ts
describe('orderPrompts', () => {
  const p = (id: string, binding: Prompt['binding']): Prompt => ({ id, label: id, binding });

  it('sorts by the pad button: A, X, Y, the bumpers, the triggers, the sticks, View, Menu, then B', () => {
    const mixed = [
      p('back', { pad: 'b' }),
      p('menu', { key: 'Escape', pad: 'menu' }),
      p('filter', { pad: 'rt' }),
      p('lock', { key: 'KeyL', pad: 'y' }),
      p('tabs', { pad: 'lb' }),
      p('salvage', { key: 'Delete', pad: 'x' }),
      p('depart', { pad: 'view' }),
      p('scroll', { pad: 'rs' }),
      p('equip', { pad: 'a' }),
    ];
    expect(orderPrompts(mixed).map((x) => x.id)).toEqual([
      'equip', 'salvage', 'lock', 'tabs', 'filter', 'scroll', 'depart', 'menu', 'back',
    ]);
  });

  it('keeps the given order among prompts of one button, and puts a prompt with no pad button before B', () => {
    const list = [
      p('back', { pad: 'b' }),
      p('keys-only', { key: 'KeyT' }),
      p('select', { mouse: 'click', pad: 'a' }),
      p('equip', { mouse: 'rmb', pad: 'a' }),
    ];
    expect(orderPrompts(list).map((x) => x.id)).toEqual(['select', 'equip', 'keys-only', 'back']);
  });

  it('returns a new array and leaves its input alone', () => {
    const list = [p('back', { pad: 'b' }), p('equip', { pad: 'a' })];
    const out = orderPrompts(list);
    expect(out).not.toBe(list);
    expect(list.map((x) => x.id)).toEqual(['back', 'equip']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/prompts.test.ts)`
Expected: FAIL, `orderPrompts` is not exported.

- [ ] **Step 3: Implement** (in `prompts.ts`, after the registry section; `PadButton` is already imported)

```ts
// ── Order ─────────────────────────────────────────────────────────────────

/** The one order every footer draws its prompts in (the pad-first spec's grammar, rule 3). */
const PAD_ORDER: readonly PadButton[] = [
  'a', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'ls', 'rs', 'view', 'menu', 'b',
];
/** A prompt with no pad button (keys or the mouse alone) sits after Menu and before B. */
const NO_PAD_RANK = PAD_ORDER.indexOf('b') - 0.5;

/**
 * `prompts` in the grammar's order: by pad button (A, X, Y, LB/RB, LT/RT, the sticks, View,
 * Menu, B), those of one button in the order given. The same order for every device, so the
 * keys' prompts sit where the pad's do.
 */
export function orderPrompts(prompts: Prompt[]): Prompt[] {
  const rank = (p: Prompt) => {
    const i = p.binding.pad ? PAD_ORDER.indexOf(p.binding.pad) : -1;
    return i < 0 ? NO_PAD_RANK : i;
  };
  return [...prompts].sort((a, b) => rank(a) - rank(b));
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/prompts.test.ts)`
Expected: PASS.

- [ ] **Step 5: Draw through it.** In `glyphs.tsx`, import `orderPrompts` from `./prompts` and change `PromptBar`'s `prompts.map(` to `orderPrompts(prompts).map(`. Update its doc comment: "Prompts in a row, in the grammar's order (`orderPrompts`): a glyph and a label each."

  If `glyphs.tsx` importing `./prompts` creates an import cycle that breaks a test (`prompts.ts` imports stores, not glyphs, so it should not), move `orderPrompts` and `PAD_ORDER` to a new `kit/prompt-order.ts` and re-export it from `prompts.ts`.

- [ ] **Step 6: Add a `PromptBar` test** (in `glyphs.test.tsx`, beside the existing PromptBar tests; follow their render helper)

```tsx
it('draws its prompts in the grammar order whatever order the screen gives', () => {
  render(
    <PromptBar
      prompts={[
        { id: 'back', label: 'Back', binding: { pad: 'b' } },
        { id: 'lock', label: 'Lock', binding: { pad: 'y' } },
        { id: 'equip', label: 'Equip', binding: { pad: 'a' } },
      ]}
    />,
  );
  const labels = [...document.querySelectorAll('.k-prompt')].map((el) => el.textContent);
  expect(labels.map((t) => t?.replace(/^.*?(Equip|Lock|Back)$/, '$1'))).toEqual(['Equip', 'Lock', 'Back']);
});
```

- [ ] **Step 7: Run the whole client suite and fix the tests that encoded an order.**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean. Any failure must be a test asserting the old order of a footer's prompts (the Loadout's, the Skills tab's, the stop's): change the expectation to the grammar's order, never the component. List each changed expectation in the commit body.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/features/delve/kit packages/client/src
git commit -m "feat(client): every footer draws its prompts in one order (A, X, Y, bumpers, triggers, sticks, View, Menu, B)"
```

---

### Task 2: a list wraps at its edge

**Files:**
- Modify: `packages/client/src/features/gamepad/use-gamepad-nav.ts` (`moveFocus`, new `wrapFocus`)
- Modify: `packages/client/src/features/delve/kit/surfaces.tsx` and `kit/types.ts` (`Dialog`'s `wrap`)
- Modify: `packages/client/src/features/delve/hub/SystemMenu.tsx` (passes `wrap`)
- Test: `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts`, `packages/client/src/features/delve/hub/__tests__/SystemMenu.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing tests** (a new `describe` in `use-gamepad-nav.test.ts`; reuse the file's way of giving boxes — each button's `getBoundingClientRect` overridden — as "moveFocus between buttons" does)

```ts
describe('moveFocus in a wrapping list', () => {
  afterEach(() => document.body.replaceChildren());

  /** A column of buttons 40 px tall, 10 px apart, inside `parent`. */
  const column = (parent: HTMLElement, n: number, left = 0): HTMLButtonElement[] =>
    Array.from({ length: n }, (_, i) => {
      const b = parent.appendChild(document.createElement('button'));
      b.textContent = `row ${i}`;
      b.getBoundingClientRect = () => DOMRect.fromRect({ x: left, y: i * 50, width: 200, height: 40 });
      return b;
    });
  const boxed = (el: HTMLElement) => {
    el.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 400 });
    return el;
  };

  it('down from the last row goes to the first, and up from the first to the last', () => {
    const list = boxed(document.body.appendChild(document.createElement('div')));
    list.setAttribute('data-pad-wrap', '');
    const rows = column(list, 4);
    rows[3].focus();
    moveFocus('down');
    expect(document.activeElement).toBe(rows[0]);
    moveFocus('up');
    expect(document.activeElement).toBe(rows[3]);
  });

  it('does not wrap without the attribute', () => {
    const list = boxed(document.body.appendChild(document.createElement('div')));
    const rows = column(list, 3);
    rows[2].focus();
    moveFocus('down');
    expect(document.activeElement).toBe(rows[2]);
  });

  it('never wraps sideways', () => {
    const list = boxed(document.body.appendChild(document.createElement('div')));
    list.setAttribute('data-pad-wrap', '');
    const rows = column(list, 3);
    rows[1].focus();
    moveFocus('right');
    expect(document.activeElement).toBe(rows[1]);
  });

  it('prefers a real neighbour: a control below the list, outside it, takes the press', () => {
    const list = boxed(document.body.appendChild(document.createElement('div')));
    list.setAttribute('data-pad-wrap', '');
    const rows = column(list, 2);
    const below = document.body.appendChild(document.createElement('button'));
    below.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 300, width: 200, height: 40 });
    rows[1].focus();
    moveFocus('down');
    expect(document.activeElement).toBe(below);
  });

  it('leaves nextFocus alone: the audit sees an edge', () => {
    const list = boxed(document.body.appendChild(document.createElement('div')));
    list.setAttribute('data-pad-wrap', '');
    const rows = column(list, 2);
    expect(nextFocus(rows[1], 'down', { memory: false })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see the first fail**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/use-gamepad-nav.test.ts -t "wrapping list")`
Expected: the first test FAILS (the focus stays on the last row); the others pass already.

- [ ] **Step 3: Implement** (in `use-gamepad-nav.ts`, above `moveFocus`)

```ts
/**
 * At an edge (nothing lies that way), up and down wrap inside a `[data-pad-wrap]` list: to its
 * topmost candidate from the bottom, its lowest from the top. Null outside such a list, for a
 * sideways press, or when `el` is the list's only candidate.
 */
function wrapFocus(el: HTMLElement, dir: NavDir, els: HTMLElement[]): HTMLElement | null {
  if (dir !== 'up' && dir !== 'down') return null;
  const list = el.closest('[data-pad-wrap]');
  if (!list) return null;
  const top = (c: HTMLElement) => c.getBoundingClientRect().top;
  const further = (c: HTMLElement, best: HTMLElement) =>
    dir === 'down' ? top(c) < top(best) : top(c) > top(best);
  const end = els.filter((c) => list.contains(c)).reduce((best, c) => (further(c, best) ? c : best), el);
  return end === el ? null : end;
}
```

  and in `moveFocus` replace its last two lines:

```ts
  const next = nextFocus(active, dir) ?? wrapFocus(active, dir, els);
  if (next) focus(next);
```

  Add to the file's head comment, after the sentence about `nextFocus`: "At an edge, up and down wrap inside a `[data-pad-wrap]` list (`wrapFocus`)."

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/use-gamepad-nav.test.ts)`
Expected: PASS, every test in the file.

- [ ] **Step 5: The system menu wraps.** `DialogProps` (in `kit/types.ts`) gains `/** Up and down wrap at the dialog's ends, its Back included (a plain list: the system menu). */ wrap?: boolean;`. In `kit/surfaces.tsx`, `Dialog` takes `wrap` and sets `data-pad-wrap={wrap ? '' : undefined}` on its `<section>` (the element carrying `data-testid={testId}`). `SystemMenu.tsx`'s menu view passes `wrap`. So the loop is Back, Resume, the entries, the dev chips, and round again. Add a test:

```tsx
// packages/client/src/features/delve/hub/__tests__/SystemMenu.test.tsx (append, or create with the
// imports and MemoryRouter wrapper AnvilHub.test.tsx uses for the menu)
it('wraps for the pad: the dialog is a [data-pad-wrap] list, its Back included', () => {
  render(
    <MemoryRouter>
      <SystemMenu onClose={() => {}} />
    </MemoryRouter>,
  );
  const list = screen.getByTestId('system-menu');
  expect(list).toHaveAttribute('data-pad-wrap');
  expect(list).toContainElement(screen.getByTestId('menu-main'));
  expect(list.querySelector('[data-pad-back]')).not.toBeNull();
});
```

- [ ] **Step 6: Run the suite**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean, all passing (baseline 1148 plus this plan's new tests).

- [ ] **Step 7: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): a [data-pad-wrap] list wraps at its ends; the kit Dialog's wrap, on the system menu"
```

---

### Task 3: a stepped tab lands on its `[data-pad-first]`

**Files:**
- Modify: `packages/client/src/features/gamepad/use-gamepad-nav.ts` (`firstAfter`)
- Test: `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts`

- [ ] **Step 1: Write the failing test.** Find the existing test of `stepTabs` through the hook ("RB steps the top-level tabs…": it renders a kit-style tablist under `data-pad-skip` with content after it, fakes a pad and presses RB). Add a sibling in the same `describe`, with the same harness, whose new tab's content holds three buttons, the second carrying `data-pad-first`:

```ts
it("a stepped tab's focus goes to its [data-pad-first] control when it has one, else its first", () => {
  // Arrange as the test above does: a skipped tablist of two tabs; tab B's content is
  // <button>one</button><button data-pad-first>two</button><button>three</button>.
  // Press RB.
  expect(document.activeElement?.textContent).toBe('two');
  // And with no [data-pad-first] in the content (remove the attribute, step away and back):
  expect(document.activeElement?.textContent).toBe('one');
});
```

  Write it out in full with that harness's helpers; the two expectations are the contract.

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/gamepad/__tests__/use-gamepad-nav.test.ts -t "data-pad-first")`
Expected: FAIL, the focus is on "one".

- [ ] **Step 3: Implement.** Replace `firstAfter`:

```ts
/**
 * Where a stepped tab's focus lands: among the candidates after `mark` in document order,
 * outside the screen's footer, the first that says so (`[data-pad-first]`: a tab's selected row),
 * else the first.
 */
function firstAfter(mark: Element): HTMLElement | null {
  const after = candidates(null).filter(
    (el) =>
      mark.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING &&
      !el.closest('[data-screen-section="screen-foot"]'),
  );
  return after.find((el) => el.hasAttribute('data-pad-first')) ?? after[0] ?? null;
}
```

  In the file's head comment, "a kit tab list puts it in the content" becomes "a kit tab list puts it in the content, on its `[data-pad-first]` control if it has one".

- [ ] **Step 4: Run the file, then the suite**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean, all passing.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/gamepad
git commit -m "feat(client): a stepped tab's focus lands on its [data-pad-first] control"
```
