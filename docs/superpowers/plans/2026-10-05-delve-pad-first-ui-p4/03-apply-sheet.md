# X, Y and the Apply sheet Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Skills tab speaks the grammar. X (and Del) removes the chosen move, on the home row and in its editor. Y (and Ctrl+Enter, and the footer's Apply) opens the **Apply sheet**, a kit `Dialog`: each skill the draft changes (its chain before and after, a payment change, the runes it sockets and pulls, the sockets it opens), the price, what it destroys and, when the engine would refuse it, why; A applies (its Apply is the first focus when it can), B returns with the draft as it was, Discard changes reverts it. No hold anywhere: today's tap-Y Remove and hold-Y Apply go, the pad's carried reorder and `captureNav` go (Position replaced it in plan 02; nothing else uses them), and the prompt runtime's hold (`padHold`) goes with its last user. The footer's Revert and Apply stay for the mouse, off the D-pad.

**Architecture:** `ApplySheet.tsx` reads the store's `selectDraftApply` (the engine's `draftPrice` and `setChains` run dry) and `draft-lines.ts` describes each changed chain from the saved and the draft chains (names and counts, no rule). `SkillsTab` owns the sheet's open state and the home row's X and Y; `MoveRows` binds its own X, Del and Y in its scope through `usePrompts` (the hub's prompts are inert while a nested scope is topmost). `ApplyBar`'s Apply opens the sheet. The price parts move out of `ApplyBar` into a shared `DraftPriceText` so the sheet and the bar say the price the same way.

**Tech Stack:** React 19, Vitest (jsdom), Playwright.

Read `00-overview.md` first. Plans 01 and 02 are done.

---

### Task 1: the draft's lines

**Files:**
- Create: `packages/client/src/features/delve/hub/skills/draft-lines.ts`
- Test: `packages/client/src/features/delve/hub/skills/__tests__/draft-lines.test.ts` (new)

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { createDelveProfile, heroChains, profileStats, type Chains, type Move } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { armed } from '../../../__tests__/armed';
import { draftLines } from '../draft-lines';

const registry = getDelveRegistry();
const profile = armed(createDelveProfile(registry, 1234, { primary: 'fire' }));
const stats = profileStats(registry, profile);
const saved = heroChains(registry, profile.equipped, profile.pair) as Chains;
const bolt = saved.primary.moves[0];

describe('draftLines', () => {
  it('one line a changed skill, in the chains’ order: its chain before and after', () => {
    const heavy: Move = { ...bolt, kind: 'heavy' };
    const lines = draftLines(registry, stats, saved, {
      primary: { ...saved.primary, moves: [heavy] },
      basic: saved.basic.map((b, i) => (i === 0 ? { ...b, kind: 'medium' as const } : b)),
    });
    expect(lines.map((l) => l.skill)).toEqual(['basic', 'primary']);
    expect(lines[1]).toMatchObject({ before: 'light Fire Bolt', after: 'heavy Fire Bolt', notes: [] });
    expect(lines[0].after).toMatch(/^medium Fire blow/);
  });

  it('notes a payment change, the sockets opened, and the runes socketed and pulled', () => {
    const withRune: Move = { ...bolt, runes: [{ id: 'quick', tier: 3 }] };
    const [line] = draftLines(registry, stats, saved, {
      primary: { moves: [withRune], payment: 'charge' },
    });
    expect(line.notes).toEqual(['Pays with charge (was mana)', 'Socket Quick III', 'Opens 1 socket']);
    const savedRuned = { ...saved, primary: { ...saved.primary, moves: [withRune] } };
    const [back] = draftLines(registry, stats, savedRuned, {
      primary: { ...saved.primary, moves: [{ ...bolt, runes: [null] }] },
    });
    expect(back.notes).toEqual(['Pull Quick III']);
  });
});
```

  If the armed sword's Primary starts with more than one move or another payment, read `saved.primary` and adjust the expected names (the test's point is the shape: one line a skill, before and after, the notes in that order).

- [ ] **Step 2: Run it** — `npx vitest run src/features/delve/hub/skills/__tests__/draft-lines.test.ts`. Expected: FAIL (no module).

- [ ] **Step 3: `draft-lines.ts`.**

```ts
import {
  CHAIN_SKILLS,
  movesOf,
  resolveChain,
  socketsOf,
  type Blow,
  type Chains,
  type ChainSkill,
  type DataRegistry,
  type HeroStats,
  type RuneRef,
} from '@alloy/engine';
import { blowText, chainText, listed, moveText } from '../../chains/chain-text';
import { runeName } from '../../runes/rune-style';

/** One skill the draft changes, as the Apply sheet lists it. */
export interface DraftLine {
  skill: ChainSkill;
  /** The chain as the weapon holds it, and as the draft makes it ("light Fire Bolt · heavy Fire Bolt"). */
  before: string;
  after: string;
  /** "Pays with charge (was mana)", "Socket Quick III", "Pull Split I", "Opens 2 sockets". */
  notes: string[];
}

/** `a` less `b`, rune by rune (id and tier). */
function less(a: RuneRef[], b: RuneRef[]): RuneRef[] {
  const left = [...b];
  return a.filter((r) => {
    const i = left.findIndex((x) => x.id === r.id && x.tier === r.tier);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
}

/**
 * What the draft changes, a line a skill in the chains' order: each chain's moves before and
 * after, and its notes (a payment change, the runes it sockets and pulls across the chain, the
 * sockets it opens). Words only: the price and what Apply destroys are the engine's (`draftPrice`).
 */
export function draftLines(
  registry: DataRegistry,
  stats: HeroStats,
  saved: Partial<Chains>,
  changes: Partial<Chains>,
): DraftLine[] {
  return CHAIN_SKILLS.filter((s) => changes[s]).map((s) => {
    const names = (c: Chains[ChainSkill]) =>
      s === 'basic'
        ? chainText((c as Blow[]).map((b) => blowText(registry, b)))
        : chainText(resolveChain(registry, stats, s, c as Chains['primary']).moves.map(moveText));
    const was = saved[s];
    const now = changes[s]!;
    const runes = (c: Chains[ChainSkill] | undefined) =>
      movesOf(c).flatMap((m) => socketsOf(m).filter((r): r is RuneRef => r !== null));
    const sockets = (c: Chains[ChainSkill] | undefined) =>
      movesOf(c).reduce((n, m) => n + socketsOf(m).length, 0);
    const notes: string[] = [];
    if (s !== 'basic' && was && 'payment' in was && 'payment' in now && was.payment !== now.payment)
      notes.push(`Pays with ${now.payment} (was ${was.payment})`);
    const socketed = less(runes(now), runes(was));
    const pulled = less(runes(was), runes(now));
    if (socketed.length) notes.push(`Socket ${listed(socketed.map((r) => runeName(registry, r)))}`);
    if (pulled.length) notes.push(`Pull ${listed(pulled.map((r) => runeName(registry, r)))}`);
    const opened = sockets(now) - sockets(was);
    if (opened > 0) notes.push(`Opens ${opened} socket${opened === 1 ? '' : 's'}`);
    return { skill: s, before: was ? names(was) : '', after: names(now), notes };
  });
}
```

  Fix the types to what `Chains` really is (`Chains['basic']` is `Blow[]`, the others `Chain`); `movesOf` already takes either.

- [ ] **Step 4: Run it** — Expected: PASS. Commit:

```bash
git add packages/client/src/features/delve/hub/skills/draft-lines.ts packages/client/src/features/delve/hub/skills/__tests__/draft-lines.test.ts
git commit -m "feat(client): the draft's lines: each changed chain before and after, its payment, runes and sockets"
```

---

### Task 2: the Apply sheet

**Files:**
- Create: `packages/client/src/features/delve/hub/skills/ApplySheet.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/ApplyBar.tsx`
- Test: `packages/client/src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx` (new)

- [ ] **Step 1: Write the failing test.**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { heroChains, type Chains } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { getDelveRegistry } from '../../../registry';
import { ApplySheet } from '../ApplySheet';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const onClose = vi.fn();
const renderSheet = () =>
  render(
    <MemoryRouter>
      <ApplySheet skill="primary" onClose={onClose} />
    </MemoryRouter>,
  );
/** The Primary's Bolt made a Lance. */
const draftLance = () => {
  const primary = chains().primary;
  act(() => store().editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], form: 'lance' }] }));
};

describe('the Apply sheet', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile(armed(store().profile));
    onClose.mockClear();
  });

  it('lists each change, the price and nothing destroyed; Apply is the first focus', () => {
    draftLance();
    renderSheet();
    const sheet = screen.getByTestId('apply-sheet');
    expect(within(sheet).getByTestId('apply-line-primary')).toHaveTextContent('light Fire Bolt');
    expect(within(sheet).getByTestId('apply-line-primary')).toHaveTextContent('light Fire Lance');
    expect(within(sheet).getByTestId('apply-sheet-price')).toHaveTextContent('free until your first dive');
    const confirm = within(sheet).getByTestId('apply-sheet-confirm');
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveAttribute('data-pad-first');
    expect(confirm).toHaveAttribute('data-tutorial', 'skills.apply');
  });

  it('A (its Apply) applies the draft and closes it', () => {
    draftLance();
    renderSheet();
    fireEvent.click(screen.getByTestId('apply-sheet-confirm'));
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(store().chainDraft).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('B (its Back) returns with the draft as it was', () => {
    draftLance();
    renderSheet();
    fireEvent.click(within(screen.getByTestId('apply-sheet')).getByRole('button', { name: /Back/ }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(store().chainDraft?.chains.primary?.moves[0].form).toBe('lance');
    expect(chains().primary.moves[0].form).toBe('bolt');
  });

  it('Discard changes reverts the draft and closes it', () => {
    draftLance();
    renderSheet();
    fireEvent.click(screen.getByTestId('apply-sheet-discard'));
    expect(store().chainDraft).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("a draft the engine refuses: Apply is off, the reason beside it, and the first focus leaves it", () => {
    // A rune the pouch doesn't hold, socketed in the draft.
    const primary = chains().primary;
    act(() =>
      store().editDraft('primary', {
        ...primary,
        moves: primary.moves.map((m) => ({ ...m, runes: [{ id: 'split', tier: 1 as const }] })),
      }),
    );
    renderSheet();
    const confirm = screen.getByTestId('apply-sheet-confirm');
    expect(confirm).toBeDisabled();
    expect(confirm).not.toHaveAttribute('data-pad-first');
    const why = screen.getByTestId('apply-sheet-why');
    expect(why).toHaveTextContent('Not enough runes in your pouch');
    expect(confirm).toHaveAttribute('aria-describedby', why.id);
  });

  it('names what Apply destroys', () => {
    // A socketed rune pulled under the shipped rule (destroy): the price says so.
    const runed = { ...chains().primary.moves[0], runes: [{ id: 'quick', tier: 3 as const }] };
    const p = store().profile;
    const weapon = p.equipped.weapon!;
    store().setProfile({
      ...p,
      equipped: {
        ...p.equipped,
        weapon: { ...weapon, moveset: { ...weapon.moveset!, chains: { ...weapon.moveset!.chains, primary: { ...chains().primary, moves: [runed] } } } },
      },
    });
    act(() => store().editDraft('primary', { ...chains().primary, moves: [{ ...runed, runes: [null] }] }));
    renderSheet();
    expect(screen.getByTestId('apply-sheet-price')).toHaveTextContent('destroys Quick III');
  });
});
```

  What to check: the refused draft is `SkillsTab.chains.test.tsx` › "a draft the engine won't price says why…"'s own (copy its exact setup if this one is refused for another reason). The "destroys" case assumes `unsocket` is `'destroy'` as shipped (`useDelveStore.setState({ unsocket: null })` in `beforeEach` if the file's other tests set it).

- [ ] **Step 2: Run it** — Expected: FAIL (no module).

- [ ] **Step 3: The shared price.** In `ApplyBar.tsx`, lift the price parts (the `parts` array and `priced` fragment) into an exported component:

```tsx
/** The draft's price in the words its `Price` draws, Links netted, then "destroys …" (`DraftPrice` from the engine); "free" or "free until your first dive" when it costs nothing; the refusal when the engine won't price it. */
export function DraftPriceText({ view, firstDive }: { view: DraftApply; firstDive: boolean }) { … }
```

  holding today's logic verbatim (the `refused` text, the parts joined by " · ", the free wordings). `ApplyBar` renders `{n} unapplied change{s} · <DraftPriceText …/>` as before; its test's texts don't change.

- [ ] **Step 4: `ApplySheet.tsx`.**

```tsx
import { useId } from 'react';
import { heroChains, type ChainSkill } from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { Button, Dialog } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { SKILL_NAME } from '../../chains/chain-text';
import { DraftPriceText, applyChains } from './ApplyBar';
import { draftLines } from './draft-lines';
import { useAnvilChains } from './useAnvilChains';

/**
 * The Apply sheet (the pad-first spec, 5; rule 1: a priced action gets a sheet): each skill the
 * draft changes, its chain before and after and its notes; the price and what it destroys; and,
 * when the engine would refuse it, why. Apply (A; the first focus when it can) applies it, all or
 * nothing; Back (B) returns with the draft as it was; Discard changes reverts it. Y, Ctrl+Enter
 * and the footer's Apply open it, for every device. `skill` is the chosen skill (Try in Training
 * comes back to it, plan 04).
 */
export function ApplySheet({ skill, onClose }: { skill: ChainSkill; onClose: () => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const view = useDelveStore(selectDraftApply);
  const { editor } = useAnvilChains();
  const id = useId();
  const saved = heroChains(registry, profile.equipped, profile.pair);
  const lines = draftLines(registry, editor.stats, saved, view.changes);
  const ok = !!view.dry?.ok;
  const why = ok ? null : (view.refused ?? (view.dry && !view.dry.ok ? view.dry.reason : null) ?? null);
  return (
    <Dialog title="Apply changes" onClose={onClose} width={720} testId="apply-sheet">
      <div className="flex flex-col gap-4">
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {lines.map((l) => (
            <li key={l.skill} className="k-well flex flex-col gap-1 p-3" data-testid={`apply-line-${l.skill}`}>
              <span className="k-label">{SKILL_NAME[l.skill]}</span>
              {l.before && <span className="text-[var(--k-text-3)] line-through">{l.before}</span>}
              <span>{l.after}</span>
              {l.notes.map((n) => (
                <span key={n} className="k-caption">{n}</span>
              ))}
            </li>
          ))}
        </ul>
        <p className="m-0 text-[var(--k-hot-hi)]" data-testid="apply-sheet-price">
          <DraftPriceText view={view} firstDive={profile.stats.dives === 0} />
        </p>
        {why && (
          <p id={`${id}-why`} className="m-0 text-[var(--k-bad-text)]" data-testid="apply-sheet-why">
            {why}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="go"
            disabled={!ok}
            aria-describedby={why ? `${id}-why` : undefined}
            data-pad-first={ok ? '' : undefined}
            data-tutorial="skills.apply"
            onClick={() => {
              if (applyChains().ok) onClose();
            }}
            testId="apply-sheet-confirm"
          >
            Apply
          </Button>
          {/* Plan 04: Try in Training (apply-sheet-try) goes here. */}
          <Button
            variant="secondary"
            onClick={() => {
              useDelveStore.getState().revertDraft();
              onClose();
            }}
            testId="apply-sheet-discard"
          >
            Discard changes
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

  The `Dialog` draws its own Back (B, Esc) from `onClose`, as the take sheet's does. The refusal: `draftApply` puts `draftPrice`'s refusal in `refused` and the dry run's in `dry`; when both say the same, it shows once. If the sheet should open while nothing is pending (it shouldn't: `SkillsTab` opens it only with changes), render nothing: `if (lines.length === 0) return null;` after `lines`, and close it with an effect when the draft empties under it (another device applied it).

- [ ] **Step 5: `ApplyBar`.** `ApplyBar({ onDelve, onApply })`: Apply's `onClick={onApply}`, `disabled={n === 0}` (a refused draft still opens the sheet, which says why), and `data-pad-skip`; Revert gains `data-pad-skip`. `APPLY_BINDING` becomes `{ key: 'Enter', ctrl: true, pad: 'y' }`. `chain-apply-why` stays in the bar for the mouse. Update the doc comment: "Apply opens the Apply sheet; Revert and Apply are the mouse's (the pad has Y and the sheet's Discard)".

- [ ] **Step 6: Run** `npx vitest run src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx` — Expected: PASS. Commit with Task 3.

---

### Task 3: X and Y; the carry and the hold go

**Files:**
- Modify: `packages/client/src/features/delve/hub/skills/SkillsTab.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/MoveRows.tsx`, `MoveInspector.tsx` (pass `onApply` down)
- Modify: `packages/client/src/features/delve/hub/skills/ChainLane.tsx` (`carrying`, `data-carried` go)
- Modify: `packages/client/src/features/delve/kit/prompts.ts`, `kit/index.ts`, `kit/types.ts`, `kit/glyphs.tsx`, `kit/KitGallery.tsx`
- Modify: `packages/client/src/features/gamepad/use-gamepad-nav.ts`
- Test: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `SkillsTab.test.tsx`, delete › "on the pad, X picks the chosen card up…", › "the carry lets go when the skill changes…" and › "on the pad, a tap of Y removes the chosen move and a held Y applies"; drop the `navCapture` import; add:

```tsx
/** A pad tap: the press, then a release frame. */
const padTap = (b: PadButton, at = 0) =>
  act(() => {
    padPrompts(new Set([b]), held(b), at);
    padPrompts(new Set(), held(), at + 50);
  });

describe('SkillsTab: X removes, Y opens the Apply sheet; no hold', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useInputDeviceStore.getState().setDevice('gamepad');
    // jsdom has no layout: a box for every element, so the editor's scope is the topmost visible one.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('on the home row X removes the chosen move, never the last', () => {
    roomy();
    renderSkills();
    screen.getByTestId('move-1').focus();
    padTap('x');
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'heavy'));
    expect(chains().primary.moves).toHaveLength(4); // a draft
  });

  it('in the editor X removes its move and closes it; Del too', () => {
    roomy();
    renderSkills();
    fireEvent.click(screen.getByTestId('move-0'));
    padTap('x');
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(summary()).toHaveTextContent(kinds('medium', 'medium', 'heavy'));
    fireEvent.click(screen.getByTestId('move-0'));
    press('Delete');
    expect(summary()).toHaveTextContent(kinds('medium', 'heavy'));
  });

  it('Y opens the Apply sheet from the home row and from the editor; A applies; with nothing changed Y opens nothing', () => {
    roomy();
    renderSkills();
    padTap('y');
    expect(screen.queryByTestId('apply-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('move-0'));
    fireEvent.keyDown(screen.getByTestId('move-kind'), { key: 'ArrowRight' });
    padTap('y', 1000);
    expect(screen.getByTestId('apply-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('apply-sheet-confirm'));
    expect(chains().primary.moves[0].kind).toBe('medium');
    expect(screen.queryByTestId('apply-sheet')).toBeNull();
  });

  it('Ctrl+Enter and the footer’s Apply open the sheet too; none of its prompts is a hold', () => {
    roomy();
    renderSkills();
    screen.getByTestId('move-0').focus();
    padTap('x'); // a change to apply
    (document.activeElement as HTMLElement | null)?.blur();
    press('Enter', { ctrlKey: true });
    expect(screen.getByTestId('apply-sheet')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('apply-sheet')).getByRole('button', { name: /Back/ }));
    fireEvent.click(screen.getByTestId('chain-apply'));
    expect(screen.getByTestId('apply-sheet')).toBeInTheDocument();
  });
});
```

  `afterEach` joins the vitest import. The old › "keys: ] and [ step the skills, Alt+arrows move the chosen move, Del removes it, Ctrl+Enter applies" becomes "… Ctrl+Enter opens the Apply sheet": its last two lines become `press('Enter', { ctrlKey: true }); fireEvent.click(screen.getByTestId('apply-sheet-confirm'));` before the kinds check. › "draws its prompts in the hub's footer": the labels are `['Edit move', 'Remove', 'Next skill']` (Apply's Y is the footer button's glyph, not a prompt); assert `'Reorder'` is absent.

  What to check: the keyboard's Ctrl+Enter reaches the prompt only while no control holds the focus with a plain Enter (the runtime's rule: Ctrl+Enter is not plain, so a focused card doesn't block it; the `blur` is belt and braces). If `padTap('x')` on the home row finds no prompt because the harness's footer scope is not the topmost (the boxes make every scope visible), the harness's `Hub` has no `data-pad-scope`: the document is the scope, and the editor (a scope) must be closed, as it is here.

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: `SkillsTab`.**
  - Delete `carry`, `release`, `endCarry`, `pickUp`, the device subscription and the unmount release; drop `captureNav` and `useInputDeviceStore` from the imports; `ChainLane` loses `carrying`.
  - `const [sheet, setSheet] = useState(false);` and `const changes = useDelveStore((s) => Object.keys(selectDraftApply(s).changes).length);` (`canApply` goes).
  - `const openSheet = () => { if (live.current.changes > 0) setSheet(true); };` (put `changes` in `live`).
  - `removeChosen`: `const { ed: now } = live.current; if (!now.locked && !now.absent && !now.fixedShape) now.remove(now.index);`.
  - The footer action: `<ApplyBar onDelve={() => hub.current.onDelve()} onApply={() => live.current.openSheet()} />` (hold `openSheet` in `live` too).
  - The drawn prompts: home row `[{ id: 'edit', label: 'Edit move', binding: { mouse: 'click', pad: 'a' } }, { id: 'remove', label: 'Remove', binding: { key: 'Delete', pad: 'x' }, onPress: removeChosen, disabled: !canEdit || entries.length < 2 }, { id: 'skill', label: 'Next skill', binding: { key: 'BracketRight', pad: 'rt' } }]`; editor `[{ id: 'change', label: 'Change', binding: { pad: 'a' } }, { id: 'remove', label: 'Remove move', binding: { key: 'Delete', pad: 'x' } }, { id: 'back', label: 'Back', binding: { key: 'Escape', pad: 'b' } }]` (display: the editor binds its own); the Mana view's `back` as today.
  - The bound-only list (`usePrompts(…, root)`) gains `{ id: 'apply', label: 'Apply', binding: APPLY_BINDING, onPress: openSheet, disabled: changes === 0 }`.
  - Render `{sheet && <ApplySheet skill={ed.skill} onClose={() => setSheet(false)} />}` after the grid.
  - Pass `onApply={openSheet}` to `MoveInspector`, which passes it to `MoveRows`.
- [ ] **Step 4: `MoveRows`** binds its scope's X, Del and Y (the hub's prompts are inert under it):

```tsx
  const root = useRef<HTMLDivElement>(null);
  usePrompts(
    [
      {
        id: 'remove',
        label: 'Remove move',
        binding: { key: 'Delete', pad: 'x' },
        onPress: remove,
        disabled: !shape || entries.length < 2,
      },
      { id: 'apply', label: 'Apply', binding: APPLY_BINDING, onPress: onApply },
    ],
    root,
  );
```

  with `ref={root}` on the `move-editor` div, `const remove = () => { onClose(); ed.remove(index); };` (the Remove button calls it too, and draws `binding={{ key: 'Delete', pad: 'x' }}`), and `onApply` a new prop. Hooks run before the `if (!move) return null` line: move that guard below them.
- [ ] **Step 5: The kit and the nav.**
  - `kit/prompts.ts`: delete `NavInput`, `carrying`, `captureNav`, `navCapture`. Then the hold: `grep -rn "padHold" packages/client/src` must show only `ApplyBar.tsx` (now gone), `kit/types.ts`, `kit/prompts.ts`, `kit/glyphs.tsx`, `kit/KitGallery.tsx` and tests. If so: in `padPrompts`, a pressed button's prompts are a `whileHeld` one (as today) or a tap fired on the press; `PadPress` keeps `at`, `whileHeld`, `fired`; `TAP_MAX_MS` and `HOLD_MS` go (grep their importers first; a test importing them goes with its case). `kit/types.ts`: `Binding.padHold` and the "Two prompts may share a pad button…" paragraph go ("A prompt with only `onPress` fires on press down; a `whileHeld` one gets `onHold(true)` on down and `onHold(false)` on up."). `kit/glyphs.tsx`: `<PadGlyph button={binding.pad} size={size} />` (drop `hold`; if `PadGlyph`'s `hold` prop has another caller, leave the prop). `KitGallery.tsx`: the apply sample loses `padHold`. If the grep finds another user, keep the hold and say so in the commit message: the grammar forbids it only in menus, and that user is the next phase's.
  - `kit/index.ts`: drop `captureNav` from the export.
  - `use-gamepad-nav.ts`: delete the `navCapture` import, `carry`, the `move` wrapper (call `moveFocus` directly), the `carried` filter (`offered` is every pressed button but the D-pad and A), and `!carry &&` before A's press; its doc comment loses "While a card is carried (`captureNav`) the D-pad and A/B/X go to it."
  - Tests: `use-gamepad-nav.test.ts` › "while a card is carried, the D-pad and A, B and X go to it…" deleted; `kit/__tests__/prompts.test.ts` › `describe('captureNav')` deleted, and its hold cases (a tap sharing a button with a hold, `padHold` timing) deleted if the hold went; `kit/__tests__/kit-index.test.ts`: `'captureNav'` leaves its list.
- [ ] **Step 6: Run them**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/skills src/features/delve/kit src/features/gamepad)`
Expected: PASS (types clean: nothing imports the deleted names).

- [ ] **Step 7: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): Skills by the grammar: X removes, Y opens the Apply sheet; the pad's carry, captureNav and the prompt hold go"
```

---

### Task 4: the tests that applied at once

**Files:**
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, `ApplyBar.test.tsx`, `SkillsTab.trail.test.tsx`
- Modify: `packages/client/e2e/fixtures/delve.ts`
- Modify: `packages/client/e2e/delve.spec.ts`, `delve-runes.spec.ts`, `delve-gamepad.spec.ts`, `delve-tutorial.spec.ts`

- [ ] **Step 1: Unit.**
  - `SkillsTab.chains.test.tsx`: its `apply` helper becomes `() => { fireEvent.click(screen.getByTestId('chain-apply')); fireEvent.click(screen.getByTestId('apply-sheet-confirm')); }`. › "Apply is off while the engine would refuse the draft, and says why; the draft stays" and › "a draft the engine won't price says why in place of a price, once": the footer's `chain-apply` is now enabled (it opens the sheet); the disabled check and the `aria-describedby` check move to the sheet (`apply-sheet-confirm`, `apply-sheet-why`), and the footer's price line still says the refusal once. › "+ socket opens one…": `toHaveAccessibleName('Apply · 1 Link · 20 scrap')` stays (the footer button's label).
  - `ApplyBar.test.tsx` › "counts the unapplied changes with their price; Revert drops them and Apply applies them" becomes "… Apply opens the sheet": render `ApplyBar` with an `onApply` spy; the click calls it, the save is untouched. › "with nothing unapplied: … Revert and Apply off": unchanged. Add: Revert and Apply carry `data-pad-skip`; the Delve button doesn't.
  - `SkillsTab.trail.test.tsx`: `chain-apply`'s `data-tutorial="skills.apply"` assert stays; add that the sheet's `apply-sheet-confirm` carries it too (open it first).
- [ ] **Step 2: The E2E fixture.**

```ts
/** Apply the Skills tab's draft: the footer's Apply opens the Apply sheet, whose Apply applies it. */
export async function applyDraft(page: Page): Promise<void> {
  await page.getByTestId('chain-apply').click();
  await page.getByTestId('apply-sheet-confirm').click();
  await expect(page.getByTestId('apply-sheet')).toHaveCount(0);
}
```

- [ ] **Step 3: The call sites.** Every `page.getByTestId('chain-apply').click()` that means "apply" becomes `await applyDraft(page)`: `delve.spec.ts` D04 (one), `delve-runes.spec.ts` R01 (`apply.click()` after its label checks), `delve-gamepad.spec.ts` G06 and G07 (one each), `delve-tutorial.spec.ts` TU01 (one). Run `grep -rn "chain-apply" packages/client/e2e` after: only label reads remain. G06 and G07 apply by the pad instead, to hold the grammar end to end: `await tap(page, BUTTON.y); await expect(page.getByTestId('apply-sheet-confirm')).toBeFocused(); await tap(page, BUTTON.a);` (`BUTTON.y` is 3 in the standard mapping: add it to the spec's map).
- [ ] **Step 4: The plan's end.**

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-03.txt" 2>&1; tail -n 15 "$SCRATCH/unit-03.txt")
(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-runes.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-tutorial.spec.ts e2e/delve-pad-nav.spec.ts --project=desktop --reporter=line > "$SCRATCH/e2e-03.txt" 2>&1; tail -n 40 "$SCRATCH/e2e-03.txt")
```

  Expected: green. No layout changed (a dialog is the kit's), so `desktop` alone; the pad audit runs because the footer's Revert and Apply left the D-pad (PN01's `skills` count drops by two; `ALLOW` and `CEILING` are plan 06's).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src packages/client/e2e
git commit -m "test(client): Apply goes through the Apply sheet: the unit tests, the applyDraft fixture and its E2E call sites"
```
