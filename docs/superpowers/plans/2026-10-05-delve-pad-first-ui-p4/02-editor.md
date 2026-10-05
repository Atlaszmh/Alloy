# The move editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the move pane stops being a wall of controls. With the editor shut it is the focused move's detail (its kind's hint, its form's line, its element's effect, its sockets, its numbers) and has no D-pad stops (rule 6). A (or a click) on a card opens the move's **editor** in the pane: a nested pad scope of rows. Kind, Elements, Position and the chain's Payment are kit `Stepper`s; Form and each socket open a grid of what fits (a nested scope again), each option with its line and what it does to the chain's damage a second; Open a socket is a row with its price. Every change is a draft edit, so the chain lane's stats and rhythm beside the pane move at once. B (or Esc, or the editor's Back) closes the editor onto its card. The lane's ◂ ▸ × toolbar and its payment chips go; mouse drag and Alt+←/→ stay.

**Architecture:** `MoveInspector` hosts the pane: the detail, or `MoveRows` (new) with, under its rows, the open grid (`FormPicker`, new; or the existing `RunePicker` with two new props, `grid` and `damage`) or the numbers. `SkillsTab` holds `editing` (the editor is open on `ed.index`) and closes it on a skill change, a link, the Mana view and a lock. `useChainEditor` gains the chain's damage a second (`dps`, `dpsWith`, through the engine's `chainCycle`) and a `shift` that can leave the focus alone (Position). X, Y, Remove's binding and the carry's retirement are plan 03's: here the editor's Remove is a mouse button only.

**Tech Stack:** React 19, Vitest (jsdom), Playwright.

Read `00-overview.md` first. Plan 01 is done.

---

### Task 1: the chain's damage a second, and a quiet shift

**Files:**
- Modify: `packages/client/src/features/delve/chains/useChainEditor.ts`
- Modify: `packages/client/src/features/delve/chains/chain-text.ts`
- Test: `packages/client/src/features/delve/chains/__tests__/useChainEditor.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `useChainEditor.test.tsx` (read its harness first: it renders the hook over a props object and reads the model), add:

```tsx
  it("dps is the chain's damage over its cycle's seconds, and dpsWith the same with the chosen move replaced", () => {
    const m = model(); // the file's own render of useChainEditor over the starting chains
    const cycle = chainCycle(registry, stats, resolveChain(registry, stats, 'primary', chains.primary!));
    expect(m.dps).toBeCloseTo(cycle.damage / cycle.seconds);
    const heavy = { ...(m.move as Move), kind: 'heavy' as const };
    const next = chainCycle(registry, stats, resolveChain(registry, stats, 'primary', {
      ...chains.primary!,
      moves: chains.primary!.moves.map((x, j) => (j === m.index ? heavy : x)),
    }));
    expect(m.dpsWith(heavy)).toBeCloseTo(next.damage / next.seconds);
  });

  it('the basic chain has no dps (its blows are no cycle)', () => {
    const m = model();
    act(() => m.pick('basic'));
    expect(model().dps).toBeNull();
    expect(model().dpsWith(model().move as Move)).toBeNull();
  });
```

  and in a `chain-text` test (create `chains/__tests__/chain-text.test.ts` if none exists):

```ts
import { describe, it, expect } from 'vitest';
import { damageShift } from '../chain-text';

describe('damageShift', () => {
  it("says what an option does to the chain's damage a second, rounded to a percent", () => {
    expect(damageShift(100, 108.4)).toBe('+8% chain damage a second');
    expect(damageShift(100, 96.6)).toBe('−3% chain damage a second');
    expect(damageShift(100, 100.3)).toBe('Chain damage a second unchanged');
  });
  it('says nothing when either side is unknown or the chain deals none', () => {
    expect(damageShift(null, 5)).toBeNull();
    expect(damageShift(5, null)).toBeNull();
    expect(damageShift(0, 5)).toBeNull();
  });
});
```

  Use the names the file's harness already has for its model, registry, stats and chains; if it builds its props inline, add a small `model()` reading the hook's latest result the same way its other tests do.

- [ ] **Step 2: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/chains)`
Expected: FAIL (`dps` undefined, `damageShift` not exported).

- [ ] **Step 3: The code.** In `chain-text.ts`:

```ts
/**
 * What an option does to the chain's damage a second (the move editor's grids): "+8% chain
 * damage a second", "−3% …", or "… unchanged"; null when either side is unknown or the chain
 * deals none.
 */
export function damageShift(now: number | null, then: number | null): string | null {
  if (now === null || then === null || now <= 0) return null;
  const pct = Math.round((then / now - 1) * 100);
  if (pct === 0) return 'Chain damage a second unchanged';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% chain damage a second`;
}
```

  In `useChainEditor.ts` (import `chainCycle` from `@alloy/engine`): to `ChainEditorModel` add

```ts
  /** The chosen ability chain's damage a second (`chainCycle`: a full cycle's damage over its seconds); null for the basic chain. */
  dps: number | null;
  /** `dps` with the chosen move replaced by `next` (what an option in the editor's grids would do); null for the basic chain. */
  dpsWith: (next: Move) => number | null;
```

  and change `shift`'s doc and signature to `shift: (i: number, by: number, focus?: boolean) => void` ("`focus` false: the focus stays where it is (the editor's Position row)"). In the hook:

```ts
  /** A chain's damage a second, by the engine's cycle. */
  const dpsOf = (c: Chain | null): number | null => {
    if (!c || !slot) return null;
    const cycle = chainCycle(registry, stats, resolveChain(registry, stats, slot, c));
    return cycle.seconds > 0 ? cycle.damage / cycle.seconds : null;
  };
```

  return `dps: dpsOf(chain)`, `dpsWith: (next) => chain && dpsOf({ ...chain, moves: chain.moves.map((m, j) => (j === index ? next : m)) })`, and in `shift` replace the `setFocusOn(...)` line with `if (focus) setFocusOn(...)`, `focus = true` defaulted in the parameter list. `ChainEditor.tsx` (the Training dock, the stop) calls `shift(i, ±1)`: unchanged.

- [ ] **Step 4: Run them** — Expected: PASS. Then `npx vitest run src/features/delve/chains/__tests__/ChainEditor.test.tsx`: PASS (untouched behaviour).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/chains
git commit -m "feat(client): the chain builder knows its chain's damage a second, and what a move change would do to it"
```

---

### Task 2: the form grid and the rune grid

**Files:**
- Create: `packages/client/src/features/delve/hub/skills/FormPicker.tsx`
- Modify: `packages/client/src/features/delve/runes/RunePicker.tsx`
- Test: `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx`

- [ ] **Step 1: RunePicker's failing test.** In `RunePicker.test.tsx` (it renders the picker with candidates; reuse its setup):

```tsx
  it('as a grid, lays the runes two to a row, each with what it does to the chain', () => {
    renderPicker({ grid: true, damage: (r) => (r.id === 'quick' ? '+8% chain damage a second' : null) });
    const list = screen.getByTestId('rune-pick-quick').parentElement!;
    expect(list.className).toMatch(/grid-cols-2/);
    expect(screen.getByTestId('rune-damage-quick')).toHaveTextContent('+8% chain damage a second');
    expect(screen.queryByTestId('rune-damage-split')).toBeNull();
  });
```

  (`renderPicker` stands for the file's own render helper: pass the two props through it, adding them to its parameter if it takes none.)

- [ ] **Step 2: `RunePicker`.** Add to `RunePickerProps`:

```ts
  /** Lay the runes out two to a row (the Skills editor's grid); a list otherwise. */
  grid?: boolean;
  /** What a rune would do to the chain's damage a second, or null to say nothing (a blow's socket). */
  damage?: (rune: RuneRef) => string | null;
```

  The list container becomes `className={grid ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'}`, and each option, after its `RuneEffect`:

```tsx
              {damage?.(rune) && (
                <span className="text-[14px] text-[var(--k-text-2)]" data-testid={`rune-damage-${rune.id}`}>
                  {damage(rune)}
                </span>
              )}
```

  The dock and the stop pass neither: unchanged.

- [ ] **Step 3: `FormPicker.tsx`.**

```tsx
import { useState } from 'react';
import type { Move } from '@alloy/engine';
import { Button, Glyph } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { damageShift, listed } from '../../chains/chain-text';
import { moveChoices } from '../../chains/MoveEditor';
import type { ChainEditorModel } from '../../chains/useChainEditor';

/**
 * The move editor's form grid (a nested pad scope): every form of the move's slot, two to a row,
 * each its glyph, name, line and what it does to the chain's damage a second; a form a socketed
 * rune doesn't fit is off and says why beside itself. A pick sets the form and closes it; Back (B,
 * Esc) closes it; either way the focus returns to the Form row.
 */
export function FormPicker({ ed, onClose }: { ed: ChainEditorModel; onClose: () => void }) {
  const registry = getDelveRegistry();
  const move = ed.move as Move;
  // The control that opened the grid: the Form row.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const close = () => {
    onClose();
    opener?.focus();
  };
  const { misfits } = moveChoices(move, ed.slot, ed.allowed);
  return (
    <div className="flex flex-col gap-3" data-pad-scope data-testid="form-picker">
      <div className="flex items-center justify-between">
        <span className="k-label">Form</span>
        <Button variant="quiet" size="sm" binding={{ key: 'Escape', pad: 'b' }} onClick={close}
          data-pad-back data-pad-skip testId="form-picker-back">
          Back
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {registry
          .getArpgData()
          .forms.filter((f) => f.slot === ed.slot)
          .map((f) => {
            const out = f.id === move.form ? [] : misfits(f.id);
            const shift = damageShift(ed.dps, ed.dpsWith({ ...move, form: f.id }));
            return (
              <button
                key={f.id}
                type="button"
                className="k-well flex flex-col gap-1 p-3 text-left"
                aria-pressed={f.id === move.form}
                disabled={out.length > 0}
                autoFocus={f.id === move.form}
                data-pad-first={f.id === move.form ? '' : undefined}
                onClick={() => {
                  ed.edit({ ...move, form: f.id });
                  close();
                }}
                data-testid={`form-${f.id}`}
              >
                <span className="flex items-center gap-2">
                  <Glyph id={f.id} size={20} />
                  <span className="k-disp text-[18px]">{f.name}</span>
                </span>
                <span className="k-caption">{f.text}</span>
                {out.length > 0 ? (
                  <span className="text-[14px] text-[var(--k-hot)]">
                    {listed(out)} doesn't fit a {f.name}
                  </span>
                ) : (
                  shift && (
                    <span className="text-[14px]" data-testid={`form-damage-${f.id}`}>
                      {shift}
                    </span>
                  )
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}
```

  The old inspector's `form-rune-note` ("Split doesn't fit every form: pull it to pick another") goes: each disabled form now says why beside itself (rule 5).

- [ ] **Step 4: Run** `npx vitest run src/features/delve/runes` — Expected: PASS. Commit with Task 3 (the grid is only reachable through the editor).

---

### Task 3: the editor's rows, and the pane

**Files:**
- Create: `packages/client/src/features/delve/hub/skills/MoveRows.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/MoveInspector.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/ChainLane.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/SkillsTab.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`
- Test: `packages/client/src/features/delve/hub/skills/__tests__/MoveRows.test.tsx` (new)

- [ ] **Step 1: The harness's helpers.** Export from `harness.tsx`:

```tsx
/** Open move `i`'s editor: a click on its card, as A on the pad. */
export const edit = (i = 0) => fireEvent.click(screen.getByTestId(`move-${i}`));

/** Step a kit Stepper with the arrow keys until it reads `text` (its `aria-valuetext`). */
export function stepTo(testId: string, text: string): void {
  const el = screen.getByTestId(testId);
  const max = Number(el.getAttribute('aria-valuemax'));
  for (let i = 0; i <= max && el.getAttribute('aria-valuetext') !== text; i++)
    fireEvent.keyDown(el, { key: 'ArrowLeft' });
  for (let i = 0; i <= max && el.getAttribute('aria-valuetext') !== text; i++)
    fireEvent.keyDown(el, { key: 'ArrowRight' });
  expect(el).toHaveAttribute('aria-valuetext', text);
}

/** Every value a kit Stepper offers, in order. */
export function valuesOf(testId: string): string[] {
  const el = screen.getByTestId(testId);
  const max = Number(el.getAttribute('aria-valuemax'));
  for (let i = 0; i < max; i++) fireEvent.keyDown(el, { key: 'ArrowLeft' });
  const out = [el.getAttribute('aria-valuetext')!];
  for (let i = 0; i < max; i++) {
    fireEvent.keyDown(el, { key: 'ArrowRight' });
    out.push(el.getAttribute('aria-valuetext')!);
  }
  return out;
}

/** Open the Form row's grid and pick `id`. */
export function pickForm(id: string): void {
  fireEvent.click(screen.getByTestId('move-form'));
  fireEvent.click(screen.getByTestId(`form-${id}`));
}
```

  (`valuesOf` walks the stepper, so it edits the draft: call it before the edit a test makes, or revert after it.) `Panes` gains the editor as `SkillsTab` wires it: a `const [editing, setEditing] = useState(false)`, `onEdit` for `ChainLane` (Step 5 below) and `editing` / `onClose` for `MoveInspector`.

- [ ] **Step 2: Write the failing tests.** `MoveRows.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, fireEvent, within } from '@testing-library/react';
import { defaultMoveset, heroChains, type Chains, type ChainSkill } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { edit, pickForm, renderSkills, stepTo, valuesOf } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const draft = () => store().chainDraft?.chains.primary;
const saved = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const summary = () => screen.getByTestId('abilities-summary');
const damage = () => screen.getByTestId('stat-damage').textContent;

/** The starting sword made epic, every chain at five slots, the Primary its four default Bolts. */
function roomy() {
  const p = store().profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const moveset = defaultMoveset(registry, weapon, 'fire', { basic: 3, primary: 4, defensive: 1, ultimate: 1 });
  const slots: Record<ChainSkill, number> = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
  store().setProfile({
    ...p,
    pair: { primary: 'fire', secondary: 'nature' },
    equipped: { ...p.equipped, weapon: { ...weapon, moveset: { chains: moveset.chains, slots } } },
  });
}

describe('the move editor', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    roomy();
  });

  it('a click (A) on a card opens its editor in the pane as a nested pad scope; with it shut the pane has no stops', () => {
    renderSkills();
    const pane = screen.getByTestId('ability-readout');
    expect(within(pane).queryAllByRole('button')).toEqual([]);
    expect(within(pane).queryAllByRole('spinbutton')).toEqual([]);
    edit(1);
    const editor = screen.getByTestId('move-editor');
    expect(editor).toHaveAttribute('data-pad-scope');
    expect(editor.parentElement!.closest('[data-pad-scope]')).not.toBeNull(); // nested: a way out
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(within(editor).getAllByRole('spinbutton').map((s) => s.dataset.testid)).toEqual([
      'move-kind',
      'move-elements',
      'move-position',
      'chain-payment',
    ]);
  });

  it("each row edits the draft at once, and the lane's numbers follow: Kind", () => {
    renderSkills();
    const before = damage();
    edit(0);
    stepTo('move-kind', 'Heavy');
    expect(draft()!.moves[0].kind).toBe('heavy');
    expect(saved().primary.moves[0].kind).toBe('light'); // a draft until Apply
    expect(summary()).toHaveTextContent('heavy Fire Bolt · medium Fire Bolt');
    expect(damage()).not.toBe(before);
  });

  it('Elements steps through the pair, then each ordered pair, main element first', () => {
    renderSkills();
    edit(1);
    expect(valuesOf('move-elements')).toEqual(['Fire', 'Nature', 'Fire + Nature', 'Nature + Fire']);
    stepTo('move-elements', 'Nature + Fire');
    expect(draft()!.moves[1].elements).toEqual(['nature', 'fire']);
    expect(screen.getByTestId('element-effect')).toHaveTextContent('Wildfire');
  });

  it('Position moves the move along its chain; the editor stays on it and keeps the focus', () => {
    renderSkills();
    edit(0);
    const position = screen.getByTestId('move-position');
    position.focus();
    expect(position).toHaveAttribute('aria-valuetext', 'Position 1 of 4');
    fireEvent.keyDown(position, { key: 'ArrowRight' });
    expect(summary()).toHaveTextContent('medium Fire Bolt · light Fire Bolt · medium Fire Bolt · heavy Fire Bolt');
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('move-position')).toHaveAttribute('aria-valuetext', 'Position 2 of 4');
    expect(document.activeElement).toBe(screen.getByTestId('move-position'));
    // The draft's origins follow the move: Apply's price sees a reorder, not two new moves.
    expect(store().chainDraft!.origins.primary).toEqual([1, 0, 2, 3]);
  });

  it("Payment is the chain's: one stepper for every move", () => {
    renderSkills();
    edit(2);
    stepTo('chain-payment', 'Charge');
    expect(draft()!.payment).toBe('charge');
    expect(screen.getByTestId('num-cost')).toHaveTextContent(/^Charge \d+/);
  });

  it("Form opens a grid of the slot's forms, each with its line and what it does to the chain; a pick closes it onto the Form row", () => {
    renderSkills();
    edit(0);
    fireEvent.click(screen.getByTestId('move-form'));
    const grid = screen.getByTestId('form-picker');
    expect(grid).toHaveAttribute('data-pad-scope');
    expect(within(grid).getByTestId('form-bolt')).toHaveAttribute('aria-pressed', 'true');
    expect(within(grid).getByTestId('form-damage-lance')).toHaveTextContent(/chain damage a second/);
    // A defensive form is no Primary's.
    expect(within(grid).queryByTestId('form-ward')).toBeNull();
    fireEvent.click(within(grid).getByTestId('form-lance'));
    expect(screen.queryByTestId('form-picker')).toBeNull();
    expect(draft()!.moves[0].form).toBe('lance');
    expect(document.activeElement).toBe(screen.getByTestId('move-form'));
  });

  it('Back closes the editor onto its card; another skill or the Mana view closes it too', () => {
    renderSkills();
    screen.getByTestId('move-2').focus();
    edit(2);
    fireEvent.click(screen.getByTestId('move-editor-back'));
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('move-2'));
    edit(2);
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.queryByTestId('move-editor')).toBeNull();
    edit(0);
    fireEvent.click(screen.getByTestId('mana-realign'));
    expect(screen.queryByTestId('move-editor')).toBeNull();
  });

  it('a blow takes a kind and an element: no form, no payment', () => {
    renderSkills();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    edit(0);
    expect(screen.queryByTestId('move-form')).toBeNull();
    expect(screen.queryByTestId('chain-payment')).toBeNull();
    expect(valuesOf('move-elements')).toEqual(['Fire', 'Nature']);
  });

  it('mid-dive a card only selects: the editor never opens', () => {
    store().setProfile({ ...store().profile, dive: { phase: 'fighting' } as never });
    renderSkills();
    edit(1);
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('move-editor')).toBeNull();
  });

  it('Remove (the mouse’s; X in plan 03) drops the move and closes the editor onto the next card', () => {
    renderSkills();
    edit(1);
    fireEvent.click(screen.getByTestId('move-remove'));
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(draft()!.moves.map((m) => m.kind)).toEqual(['light', 'medium', 'heavy']);
    expect(document.activeElement).toBe(screen.getByTestId('move-0'));
  });
});
```

  What to check while writing them:
  - The mid-dive line: copy how `SkillsTab.chains.test.tsx` › "is read-only while a dive is under way" makes a dive active (it may call `store().startDive(1)`); use the same, not the cast above.
  - `Position 1 of 4` is the stepper's `aria-valuetext` (its `text`); its label reads `1 of 4`.
  - The origins line holds if `editDraft` composes the map as `SkillsTab.chains.test.tsx` › "adds, reorders and removes…" shows; if the store keeps the identity for a single swap differently, assert what `chainOrigins` would read from it instead (the point is that it is not `[null, null, …]`).
  - Remove's focus: `ed.remove` focuses `max(0, i - 1)`, so removing move 1 lands on move 0, as the old toolbar did.

- [ ] **Step 3: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/MoveRows.test.tsx)`
Expected: FAIL (`move-editor` not found).

- [ ] **Step 4: `MoveRows.tsx`.**

```tsx
import { useState } from 'react';
import {
  MOVE_KINDS,
  runeTargetOf,
  runeText,
  type Blow,
  type ManaType,
  type Move,
  type MoveKind,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Price, Stepper } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { RuneGlyph } from '../../runes/RuneGlyph';
import { RunePicker } from '../../runes/RunePicker';
import { dormantText, runeName } from '../../runes/rune-style';
import { KIND_NAME, damageShift } from '../../chains/chain-text';
import { KIND_HINT, moveChoices } from '../../chains/MoveEditor';
import { PAYMENTS, type ChainEditorModel } from '../../chains/useChainEditor';
import { FormPicker } from './FormPicker';
import type { AnvilChains } from './useAnvilChains';

/** Every element set a move may take: each element offered, then (an ability's) each ordered pair, main element first; its own first if none of those. */
export function elementSets(
  move: Move | Blow,
  shown: readonly ManaType[],
  takes: (els: readonly ManaType[]) => boolean,
): ManaType[][] {
  const pairs = 'form' in move ? shown.flatMap((a) => shown.filter((b) => b !== a).map((b) => [a, b])) : [];
  const sets = [...shown.map((m) => [m]), ...pairs].filter(takes);
  const own = 'element' in move ? [move.element] : move.elements;
  return sets.some((s) => s.join('+') === own.join('+')) ? sets : [own, ...sets];
}

/**
 * The Skills tab's move editor (the pad-first spec, 5): a nested pad scope of rows over the
 * chosen move. Kind, Elements, Position and the chain's Payment are steppers; Form and each socket
 * open a grid of what fits (`FormPicker`, the `RunePicker` as a grid), each option with what it
 * does to the chain's damage a second; Open a socket is a row with its price, off with the
 * engine's reason beside it. Every change is a draft edit. Back (B, Esc) and Remove (X, Del:
 * plan 03 binds them) are off the D-pad. The guided start's lesson marks the Primary's last move's
 * Elements and its first move's socket rows.
 */
export function MoveRows({ ed, anvil, onClose }: { ed: ChainEditorModel; anvil: AnvilChains; onClose: () => void }) {
  const registry = getDelveRegistry();
  const secondary = useDelveStore((s) => s.profile.pair.secondary);
  const [forms, setForms] = useState(false);
  // The control that opened the editor: its card.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const { move, index, entries, chain, slot } = ed;
  const runes = anvil.editor.runes;
  if (!move) return null;
  const close = () => {
    onClose();
    opener?.focus();
  };
  const { off, shown, takes } = moveChoices(move, slot, ed.allowed);
  const name = (m: ManaType) => manaStyle(registry, m).name;
  const sets = elementSets(move, shown, takes);
  const own = ('element' in move ? [move.element] : move.elements).join('+');
  const setText = (s: ManaType[]) => `${s.map(name).join(' + ')}${s.some((m) => off.includes(m)) ? ' · off-pair' : ''}`;
  const ab = ed.resolved?.moves[index] ?? null;
  const lessonLast = ed.skill === 'primary' && index === entries.length - 1;
  const lessonFirst = ed.skill === 'primary' && index === 0;
  const shape = !ed.fixedShape;

  return (
    <div className="flex flex-col gap-3" data-pad-scope data-testid="move-editor">
      <div className="flex items-center justify-between gap-2">
        <span className="k-label">Edit move {index + 1}</span>
        <span className="flex gap-2">
          <Button variant="quiet" size="sm" disabled={!shape || entries.length < 2}
            onClick={() => { onClose(); ed.remove(index); }}
            aria-label={`Remove ${ed.names[index]}`} data-pad-skip testId="move-remove">
            Remove
          </Button>
          <Button variant="quiet" size="sm" binding={{ key: 'Escape', pad: 'b' }} onClick={close}
            data-pad-back data-pad-skip testId="move-editor-back">
            Back
          </Button>
        </span>
      </div>
      <Stepper
        label="Kind"
        testId="move-kind"
        value={move.kind}
        onChange={(k: MoveKind) => ed.edit({ ...move, kind: k } as typeof move)}
        options={MOVE_KINDS.map((k) => ({ id: k, label: KIND_NAME[k], text: KIND_NAME[k] }))}
        note={'form' in move ? KIND_HINT[move.kind] : undefined}
      />
      {'form' in move && (
        <button type="button" className="k-stepper-row text-left" onClick={() => setForms(true)} data-testid="move-form">
          <span className="k-label">Form</span>
          <span className="k-disp">{registry.getForm(move.form).name} ▸</span>
        </button>
      )}
      <Stepper
        label={'form' in move ? 'Elements' : 'Element'}
        testId="move-elements"
        value={own}
        onChange={(id: string) =>
          ed.edit('element' in move ? { ...move, element: id as ManaType } : { ...move, elements: id.split('+') as ManaType[] })
        }
        options={sets.map((s) => ({ id: s.join('+'), label: setText(s), text: setText(s) }))}
        tutorial={lessonLast ? 'skills.elements' : undefined}
        done={lessonLast ? 'elements' in move && !!secondary && move.elements.includes(secondary) : undefined}
      />
      {runes &&
        ed.sockets.map((r, s) => {
          const idle = ed.dormant(index).includes(s);
          const text = r ? runeText(registry, r, runeTargetOf(runes.weaponBaseId, move), { payment: ab?.payment, ease: ab?.ease }) : null;
          return (
            <button key={s} type="button" className="k-well flex items-center gap-3 px-3 py-2.5 text-left"
              onClick={() => ed.openPicker(index, s)}
              data-testid={`inspect-socket-${s}`}
              data-tutorial={lessonFirst && s === 0 ? 'skills.rune' : undefined}
              data-tutorial-done={r !== null}>
              {r ? <RuneGlyph rune={r} dormant={idle} /> : <span aria-hidden className="text-[var(--k-steel-3)]">◇</span>}
              <span className="font-semibold">{r ? runeName(registry, r) : 'Empty socket'}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--k-text-3)]">
                {r ? (idle ? dormantText(registry.getRune(r.id)) : text!.effect) : 'pick a rune'}
              </span>
              {text?.cost && !idle && <span className="text-[14px] text-[var(--k-hot-hi)]">{text.cost}</span>}
            </button>
          );
        })}
      {runes && ed.nextSocket !== undefined && (
        <>
          <button type="button" className="k-well flex items-center gap-3 px-3 py-2.5 text-left"
            disabled={!!ed.openWhy} onClick={ed.openSocket}
            aria-describedby={ed.openWhy ? 'socket-open-why' : undefined}
            data-testid="socket-open"
            data-tutorial={lessonFirst ? 'skills.socket' : undefined}
            data-tutorial-done={ed.sockets.length > 0}>
            <span className="font-semibold">Open a socket</span>
            {ed.nextSocket && <Price links={ed.nextSocket.links} scrap={ed.nextSocket.scrap} />}
          </button>
          {ed.openWhy && (
            <span id="socket-open-why" className="text-[14px] text-[var(--k-hot)]" data-testid="socket-open-why">
              {ed.openWhy}
            </span>
          )}
        </>
      )}
      {shape && entries.length > 1 && (
        <Stepper
          label="Position"
          testId="move-position"
          value={String(index)}
          onChange={(id: string) => ed.shift(index, Number(id) - index, false)}
          options={entries.map((_, j) => ({ id: String(j), label: `${j + 1} of ${entries.length}`, text: `Position ${j + 1} of ${entries.length}` }))}
        />
      )}
      {chain && shape && (
        <Stepper
          label="Payment"
          testId="chain-payment"
          value={chain.payment}
          onChange={ed.setPayment}
          options={PAYMENTS.map(([p, label]) => ({ id: p, label, text: label }))}
          note={`${PAYMENTS.find(([p]) => p === chain.payment)![2]} One payment for every move.`}
        />
      )}
      {ed.picker ? (
        <RunePicker
          {...ed.picker}
          grid
          damage={'form' in move ? (rune) => damageShift(ed.dps, ed.dpsWith({ ...move, runes: ed.sockets.map((x, k) => (k === ed.socket ? rune : x)) })) : undefined}
          tutorial={lessonFirst ? 'skills.rune' : undefined}
        />
      ) : forms ? (
        <FormPicker ed={ed} onClose={() => setForms(false)} />
      ) : null}
    </div>
  );
}
```

  Notes for the implementer:
  - `id="socket-open-why"` is a fixed id: there is one editor on screen. If the kit lints against it, use `useId()`.
  - `k-stepper-row` is the kit's row class (phase 3): the Form row takes it so it lines up with the steppers. If its CSS assumes a `role="spinbutton"` child, give the Form row a class of its own in `kit.css` with the same grid.
  - The open grid sits under the rows, as the old picker sat in place of the numbers: the rows that opened it stay mounted, so a grid's Back returns the focus to its row (`RunePicker`'s and `FormPicker`'s `opener`).
  - The Elements done rule is the old inspector section's, on the lesson's move only.

- [ ] **Step 5: `ChainLane`.**
  - Props: `carrying` stays (plan 03 removes it); add `onEdit: (i: number, socket?: number) => void`.
  - The card's `onClick`: `if (!dragged.current) onEdit(i); dragged.current = false;`.
  - Delete the payment `Segmented` in the heading row (and its `Segmented`, `AbilityPayment`, `PAYMENTS` imports if unused): Payment is the editor's row.
  - Delete the chosen card's ◂ ▸ × toolbar (`role="group" aria-label="Reorder"`): Position, a drag and Alt+←/→ move a move; the editor's Remove (and X, plan 03) removes it.
  - The card's sockets: the wrapper `span` keeps `data-testid={`sockets-${i}`}`, loses its `data-tutorial`/`data-tutorial-done` (the lesson's socket target is the editor's row now) and gains `data-pad-skip`; `SocketRow` gets `nextPrice={null}`, no `onOpenSocket`, no `whyId`, and `onSocketTap={(s) => onEdit(i, s)}`.
  - Delete the lane's `socket-open-why` line (it is the editor's now).

- [ ] **Step 6: `MoveInspector`, the pane.** Signature `MoveInspector({ ed, anvil, editing, onClose }: { …; editing: boolean; onClose: () => void })`. The pane (`Panel`, `testId="ability-readout"`, now with `className="k-scroll"` and `data-pad-scroll`) keeps its heading ("Move n · name", `move-edited`) and then:
  - **editing:** `<MoveRows ed={ed} anvil={anvil} onClose={onClose} />`, then, unless a grid is open (`ed.picker` or the form grid: let `MoveRows` own the numbers' place by rendering `children` under its rows, or simply always render the numbers after `MoveRows`; pick the second: a grid scrolls the pane, and the numbers under it are no stops), the numbers block exactly as today (`MoveNumbers`, or the blow's `NumberTable`).
  - **not editing (the detail, no controls):** the kind's hint (`KIND_HINT`, or the blow's hold line), the form's line (`registry.getForm(move.form).text`), the element effect (`element-effect`, as today), the off-pair note (`off-pair-note`), the sockets as text (`socket-count` "Sockets · n of cap", each socket a `span` with the rune's glyph, name and effect, `detail-socket-<s>`), then the numbers.
  - Delete the kind, form and element `Segmented`s, the swap button and the socket buttons from this file: the editor has them.

- [ ] **Step 7: `SkillsTab`.**

```tsx
  const [editing, setEditing] = useState(false);
  /** A or a click on card `i` (with `socket`, a pip: its rune grid too): its editor, unless the chain is read-only. */
  const onEdit = (i: number, socket?: number) => {
    if (!canEdit) return ed.select(i);
    if (socket === undefined) ed.select(i);
    else ed.openPicker(i, socket);
    setEditing(true);
  };
  // Another skill, a link, the Mana view or a lock closes it.
  useEffect(() => setEditing(false), [ed.skill, link, mana, canEdit]);
```

  `canEdit` is `!locked && !absent && !fixedShape` (it exists). Pass `onEdit` to `ChainLane` and `editing` / `onClose={() => setEditing(false)}` to `MoveInspector`. While `editing`, the tab's prompts are the editor's (drawn in the footer; the editor's own scope binds nothing yet, plan 03 adds X and Y):

```tsx
      : editing
        ? [
            { id: 'change', label: 'Change', binding: { pad: 'a' } },
            { id: 'back', label: 'Back', binding: { key: 'Escape', pad: 'b' } },
          ]
```

  placed after the `mana` branch and before the `carry` branch, with `editing` in the memo's dependencies. The home row's `select` prompt is relabelled "Edit move".

- [ ] **Step 8: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/MoveRows.test.tsx)`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/client/src/features/delve/hub/skills packages/client/src/features/delve/runes
git commit -m "feat(client): A on a move opens its editor: Kind, Elements, Position and Payment steppers, the form and rune grids with what each does to the chain; the pane is the move's detail otherwise"
```

  Before it: `npx vitest related --run` over the changed src files; Task 4 fixes what that finds in the older tests.

---

### Task 4: the tests that clicked the inspector

**Files:**
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/ChainLane.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.trail.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx`

- [ ] **Step 1: The mechanical rule** for `SkillsTab.chains.test.tsx` (import `edit`, `pickForm`, `stepTo`, `valuesOf` from `./harness`):
  - Before a test's first edit of a move, `edit(i)` (the move it edits; `fireEvent.click(screen.getByTestId('move-i'))` lines that selected a move become `edit(i)`).
  - `form-<id>` clicks → `pickForm('<id>')`; reading `form-<id>` (presence, `toBeDisabled`) needs the grid open: `fireEvent.click(screen.getByTestId('move-form'))` first, and Back (`move-editor`'s grid Back, `form-picker-back`) after if the test goes on.
  - `kind-<k>` clicks → `stepTo('move-kind', KIND_NAME[k])` (`Light`, `Medium`, `Heavy`, `Hold`).
  - `payment-<p>` clicks → `stepTo('chain-payment', 'Mana' | 'Charge' | 'Cast')`.
  - `element-<m>` / `infusion-<m>` / `swap-elements` → `stepTo('move-elements', <the set's text>)` ("Fire + Nature", "Nature + Fire", "Nature").
  - `move-left-<i>` / `move-right-<i>` → `stepTo('move-position', 'Position j of n')` in move `i`'s editor; `move-remove-<i>` → `edit(i)` then `move-remove`.
- [ ] **Step 2: What each test asserts instead** (titles as they stand):
  - "edits a draft: Apply commits it…", "keeps the draft when the tab closes…", "Apply is off while the engine would refuse…", "Add slot waits while its chain has a change pending…", "equipping another weapon, or a realign, drops the draft", "after the first dive the draft shows its price…", "a refused Add slot or Apply says the engine's reason…": the mechanical rule only.
  - "edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap": `edit(1); pickForm('burst'); stepTo('move-elements', 'Fire + Nature')`, apply; then `stepTo('move-elements', 'Nature + Fire')` (the swap is a set now), apply, `['nature', 'fire']`; then `stepTo('move-elements', 'Nature')`, `['nature']`. The `element-effect` check reads the pane (it stays).
  - "sets a move's kind, and the chain's one payment with its wind-up", "says each move's beat…", "warns when a mana cost is bigger than the pool", "warns when a hold move's full charge…": the rule; the `num-*` and `cost-warning` reads are the pane's numbers, under the rows while editing.
  - "adds, reorders and removes moves within the slots, never below one": `move-remove-0` disabled at one move → `edit(0)`, `move-remove` disabled and named "Remove light Fire Bolt"; then Back. The adds (+ Move) are unchanged and keep their focus asserts. "make it heavy, then bring it forward": `edit(4); stepTo('move-kind', 'Heavy'); stepTo('move-position', 'Position 4 of 5')`, then `move-3` is pressed; then `edit(0)` and `move-remove`; `move-0` has the focus (the next card, `max(0, i - 1)`).
  - "▸ moves a card later and the selection follows it; the ends are off" becomes "Position moves a card; the selection follows it": `edit(0); stepTo('move-position', 'Position 2 of 3')`, the summary, `move-1` pressed, the pane's heading "light Fire Bolt"; the ends: `move-position`'s `aria-valuemin`/`aria-valuemax` are 0 and 2. The old focus-on-◂ asserts go (no toolbar).
  - "two ◂ presses move a card two places, the selection and the focus with it": `edit(2)`, two ArrowLeft on `move-position` with it focused; `move-0` pressed; the focus is still `move-position`; apply; `['heavy', 'light', 'medium']`.
  - "marks a move outside the pair off-pair…": `edit(0)`: `move-elements` reads `Storm · off-pair`; `valuesOf('move-elements')` holds `Fire` (and the secondary if bound) and `Storm · off-pair`, and no set pairing Storm with another (`Storm + Fire`, `Fire + Storm`); then `edit(1)`: no value names Storm (never offered to another move).
  - "each ability offers only its own forms; a blow picks from the pair": the forms are read in the open grid (`move-form`); the blow's half reads `valuesOf('move-elements')` on a basic card's editor.
  - "is read-only while a dive is under way", "mid-dive every move can still be picked and read, but not moved, removed or added", "unarmed, it shows the default chains read-only": a card click selects and the editor never opens (`move-editor` absent); the old `form-lance` disabled read becomes that absence.
  - Sockets: `tapSocket(i, name)` (the card's pip) still works: the pip opens the editor and its grid. "+ socket opens one on the chosen move at its price…": `edit(0)`; `socket-open` is the editor's row (drop the `within(chain-cards)` identity line); its text "Open a socket · 1 Link · 20 scrap" (assert the parts: `toHaveTextContent('Open a socket')`, `'1 Link'`, `'20 scrap'`); after it the row is gone at the common cap. "+ socket is off without the Links…": `edit(0)` first. "a form a socketed rune doesn't fit is off; the kind stays free": in the open grid, `form-burst` is disabled and its own text reads "Split doesn't fit a Burst" (no `title`, no `form-rune-note`). "a reorder carries the runes with their move": `move-right-0` → `stepTo('move-position', 'Position 2 of …')`. "the inspector's socket rows open the rune picker in place of the numbers, as a scope" becomes "the editor's socket rows open the rune grid under the rows, as a scope": `edit(0)`, `inspect-socket-0`, the picker has `data-pad-scope` and its list `grid-cols-2`.
- [ ] **Step 3: The other files.**
  - `ChainLane.test.tsx` › "the chosen card alone carries the ◂ ▸ × toolbar" and › "the toolbar is the mouse's: the pad skips it (X carries, Y removes)": delete; add "a card's pips are off the D-pad and a pip's click opens its editor at that socket" (render `Panes`, click `within(sockets-0).getByRole('button', { name: 'Socket 1: empty' })`, expect `move-editor` and `rune-picker`; `sockets-0` has `data-pad-skip`). The drag tests and the stats and rhythm tests stay.
  - `rune-costs.test.tsx`: its `tapSocket` reaches the picker through the pip (works once `Panes` wires `onEdit`); "the inspector's rune price" tests read the pane's numbers (they show with the editor shut): unchanged.
  - `SkillsTab.trail.test.tsx`: plan 05 rewrites it whole; here make it pass with the least change: `sockets-0`'s `skills.socket` asserts become the editor's `socket-open` (`edit(0)` first; `target('skills.socket')` is `socket-open`, done once a socket is open); `element-frost` clicks become `edit(1); stepTo('move-elements', 'Frost')`.
  - `SkillsTab.test.tsx` › "draws its prompts in the hub's footer": `'Select move'` becomes `'Edit move'`. The keys test's `fireEvent.click(screen.getByTestId('move-3'))` now opens the editor, whose scope makes the hub's keys inert: replace it with `screen.getByTestId('move-3').focus()` (focus selects). Its carry and Y tests stay until plan 03.
- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills src/features/delve/chains src/features/delve/runes)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/skills/__tests__
git commit -m "test(client): the Skills tests edit through the move editor: steppers for kind, elements, position and payment, grids for form and runes"
```

---

### Task 5: the E2E that edited a move

**Files:**
- Modify: `packages/client/e2e/delve.spec.ts` (D04)
- Modify: `packages/client/e2e/delve-runes.spec.ts` (R01)
- Modify: `packages/client/e2e/delve-gamepad.spec.ts` (G06, G07)
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts` (PN03)
- Modify: `packages/client/e2e/delve-tutorial.spec.ts` (TU01's Skills clicks)

- [ ] **Step 1: D04.** After `mana-back`:

```ts
    // The Primary's one move becomes a Wildfire Burst: its editor's Form grid, then its Elements.
    await page.getByTestId('move-0').click();
    await page.getByTestId('move-form').click();
    await page.getByTestId('form-burst').click();
    await stepTo(page, 'move-elements', /^Fire \+ Nature$/);
    await expect(page.getByTestId('ability-readout')).toContainText('light Wildfire Burst');
```

  (`stepTo` from `./fixtures/delve`; add it to the import.) The rest stays; `abilities-summary` and `chain-slots` are the lane's.

- [ ] **Step 2: R01.** Replace the three socket lines:

```ts
    await expect(cards.getByTestId('socket-0')).toHaveCount(0);
    await page.getByTestId('move-0').click();
    await page.getByTestId('socket-open').click();
    await page.getByTestId('inspect-socket-0').click();
```

  The card's pip `socket-0` still carries `data-rune` (its later reads stay), and "A filled socket shows its rune with Pull" clicks the pip, which opens the editor at its grid: unchanged. R05 (the readout, then the pip) needs no change; run it to be sure.

- [ ] **Step 3: G06,** from "Along the chain's cards" (plan 01):

```ts
    await tap(page, BUTTON.right);
    await expect(page.getByTestId('move-1')).toBeFocused();
    // A opens the move's editor; its first row, Kind, takes the focus.
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await expect(page.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    const kind = page.getByTestId('move-kind');
    await expect(kind).toBeFocused();
    await expect(kind).toHaveAttribute('aria-valuetext', 'Light');
    await tap(page, BUTTON.right);
    await expect(kind).toHaveAttribute('aria-valuetext', 'Medium');
    // A draft until Apply.
    await expect(page.getByTestId('chain-apply')).toBeEnabled();
    expect((await blow()).kind).toBe('light');
    // B closes the editor onto its card.
    await tap(page, BUTTON.b);
    await expect(page.getByTestId('move-editor')).toHaveCount(0);
    await expect(page.getByTestId('move-1')).toBeFocused();
    await page.getByTestId('chain-apply').click();
    await expect.poll(async () => (await blow()).kind).toBe('medium');
```

  The old `padWalk(page, 'kind-medium')` and its `aria-checked` read go.

- [ ] **Step 4: G07,** after RB lands on `move-0`:

```ts
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await padTo('inspect-socket-0');
    const picker = page.getByTestId('rune-picker');
    // A opens the rune grid, which takes the focus; B backs out, the focus back on the row.
    await tap(page, BUTTON.a);
    await expect(picker).toBeVisible();
    await expect.poll(focused).toMatch(/^rune-/);
    await tap(page, BUTTON.b);
    await expect(picker).toBeHidden();
    await expect(page.getByTestId('inspect-socket-0')).toBeFocused();
    // Again, and A on Quick sockets it: a draft until Apply.
    await tap(page, BUTTON.a);
    await expect(picker).toBeVisible();
    await padTo('rune-pick-quick');
    await tap(page, BUTTON.a);
    await expect(picker).toBeHidden();
    await expect(page.getByTestId('chain-cards').getByTestId('socket-0')).toHaveAttribute('data-rune', 'quick:3');
```

  then the save checks and Apply as before. `padTo` walks a grid now: try each direction in turn.

```ts
    const padTo = async (id: string) => {
      for (const b of [BUTTON.down, BUTTON.right, BUTTON.up, BUTTON.left, BUTTON.down])
        for (let i = 0; i < 6 && (await focused()) !== id; i++) await tap(page, b);
      expect(await focused()).toBe(id);
    };
```

- [ ] **Step 5: PN03** gains the editor (after its last `back`):

```ts
    // A opens the card's editor (its own scope: the focus goes in); B comes back to the card.
    await mark(page, 'card');
    await tap(page, BUTTON.a);
    await expect(page.getByTestId('move-editor')).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="move-editor"]'))).toBe(true);
    await tap(page, BUTTON.b);
    await expect(page.getByTestId('move-editor')).toHaveCount(0);
    expect(await marked(page)).toBe('card');
```

- [ ] **Step 6: TU01's Skills clicks** (the lesson by the mouse; plan 05 makes it follow the marker):

```ts
    await page.getByTestId('chain-skill-primary').click();
    await page.getByTestId('add-slot').click();
    await page.getByTestId('move-2').click();
    await stepTo(page, 'move-elements', /^Frost$/);
    await page.getByTestId('move-editor-back').click();
    await page.getByTestId('move-0').click();
    await page.getByTestId('socket-open').click();
    await page.getByTestId('inspect-socket-0').click();
    await page.getByTestId('rune-picker').locator('[data-testid^="rune-pick-"]').first().click();
    await page.getByTestId('chain-apply').click();
```

  (`cards` goes if nothing else reads it.)

- [ ] **Step 7: The plan's end.**

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-02.txt" 2>&1; tail -n 15 "$SCRATCH/unit-02.txt")
(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-runes.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-pad-nav.spec.ts e2e/delve-tutorial.spec.ts --project=desktop --project=desktop-1080 --reporter=line > "$SCRATCH/e2e-02.txt" 2>&1; tail -n 40 "$SCRATCH/e2e-02.txt")
```

  Expected: the unit suite green; the five specs PASS at both sizes (the pane's layout changed, and the stops: the pad audit runs). If plan 01's E2E were skipped (one agent for both), this run covers them. PN01's `skills` count may drop; `ALLOW.skills` may only go down (plan 06 records it). A failing TU01 at `move-elements`: the lesson's Primary is the weapon's (an uncommon sword, frost bound): `Frost` must be a value of the last move's Elements; read `valuesOf` in a unit test on that save before changing anything.

- [ ] **Step 8: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): D04, R01, G06, G07, PN03 and TU01 edit moves through the editor"
```
