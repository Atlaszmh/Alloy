# How to delve becomes Help Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** How to delve leaves the Loadout's default pane (which shows the worn weapon's compare when nothing is focused). It becomes Help: one topic a page (Controls, Weapons, Skills, The forge, The floor, Banking), reached from a Help entry in the system menu and the pause (a dialog, the topics on LT/RT) and from a Help section of the Codex. A Jump in save meets it once: the dialog opens when its mana is chosen.

**Architecture:** `hub/HowTo.tsx` is split by its paragraphs into `hub/help/help-topics.tsx` (`HELP_TOPICS`, `HelpPage`), the same words and the same engine reads. `hub/help/HelpDialog.tsx` is a kit `Dialog` holding a sub `Tabs` over the topics and the page in a `[data-pad-scroll]` body (the right stick scrolls it, plan 01). The Codex gains a `help` section whose cards are the topics and whose detail is the page. `DelveCamp` opens the dialog once after Jump in.

**Tech Stack:** React 19, Zustand, Vitest (jsdom), Playwright.

Read `00-overview.md` first. Plans 01 and 02 are done. Spec: section 4, "How to delve", with the overview's edits 5 and 6.

**"A new save still meets it once": what the code does now.** `LoadoutTab` shows `HowTo` in the compare column while nothing is targeted, the save is not guided (`!profile.tutorial`), and `strike_the_anvil` is unclaimed; `GuidedChoice`'s Jump in promises "Straight to the Anvil and the open depths, with How to delve to read". So it is shown to Jump in saves (and to a guided start skipped before its first lessons). The plan keeps that promise with one dialog at the moment the save begins: `DelveCamp` holds `jumped` already (this visit's answer); once the mana is chosen after a Jump in, Help opens. A save that skips the guided start later finds Help in the menu and the Codex: a skip is a player who has seen the Anvil. No save field is added (the spec: no save change).

**The guided start:** no target lives in How to delve. `HowTo` is hidden on a guided save today; the dialog opens only after Jump in, never on a guided save.

---

### Task 1: the topics

**Files:**
- Create: `packages/client/src/features/delve/hub/help/help-topics.tsx`
- Delete: `packages/client/src/features/delve/hub/HowTo.tsx`
- Move and rewrite: `packages/client/src/features/delve/hub/__tests__/HowTo.test.tsx` → `packages/client/src/features/delve/hub/help/__tests__/help-topics.test.tsx`

- [ ] **Step 1: Write the failing test.** `git mv` the test file, then make each of its five tests render the topic that holds its words (`render(<HelpPage topic="controls" />)` and so on) and add:

```tsx
  it('has one topic a page, in order, each with its title', () => {
    expect(HELP_TOPICS.map((t) => [t.id, t.title])).toEqual([
      ['controls', 'Controls'],
      ['weapons', 'Weapons'],
      ['skills', 'Skills'],
      ['forge', 'The forge'],
      ['floor', 'The floor'],
      ['banking', 'Banking'],
    ]);
    for (const { id } of HELP_TOPICS) {
      cleanup();
      render(<HelpPage topic={id} />);
      expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', id);
    }
  });
```

  Which test reads which topic: "speaks mouse and keys…" and "speaks the controller…" and "draws the player's own bindings" → `controls`; "names what a weapon carries…" → `weapons` (its `howto-carries` and `howto-carry-<skill>` ids stay); "tells of materials, the forge, the floor and what a death costs" splits into three expectations over `forge`, `floor` and `banking`. "names the Skills tab" → `skills`.

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/help)`
Expected: FAIL (no `help-topics`).

- [ ] **Step 3: Implement.** `help-topics.tsx` takes `HowTo`'s body paragraph by paragraph, unchanged in words:

```tsx
/** Help's topics (the pad-first spec, 4): How to delve, one topic a page. */
export type HelpTopicId = 'controls' | 'weapons' | 'skills' | 'forge' | 'floor' | 'banking';

export const HELP_TOPICS: { id: HelpTopicId; title: string }[] = [
  { id: 'controls', title: 'Controls' },
  { id: 'weapons', title: 'Weapons' },
  { id: 'skills', title: 'Skills' },
  { id: 'forge', title: 'The forge' },
  { id: 'floor', title: 'The floor' },
  { id: 'banking', title: 'Banking' },
];

/**
 * One Help topic's page: the controls in the glyphs of the device in hand from the player's own
 * bindings (and attacking and the dodge), what a weapon carries (the engine's words), the chains,
 * materials and the forge, the floor, and banking with what a death costs (the balance's share).
 */
export function HelpPage({ topic }: { topic: HelpTopicId }) {
  // HowTo's `g`, `always`, `firstFlux` and `loss`, as they were.
  …
  return (
    <div
      className="flex flex-col gap-2 text-[16px] leading-relaxed text-[var(--k-text-2)]"
      data-testid="delve-howto"
      data-topic={topic}
    >
      {topic === 'controls' && (<>{/* HowTo's device paragraph, then its attack and dodge paragraph */}</>)}
      {topic === 'weapons' && (<div data-testid="howto-carries">{/* HowTo's carries block */}</div>)}
      {topic === 'skills' && <p>{/* HowTo's chains paragraph */}</p>}
      {topic === 'forge' && <p>{/* HowTo's materials paragraph */}</p>}
      {topic === 'floor' && <p>{/* HowTo's floor paragraph */}</p>}
      {topic === 'banking' && <p>{/* HowTo's banking paragraph */}</p>}
    </div>
  );
}
```

  Copy each paragraph's JSX verbatim from `HowTo.tsx` (it is 60 lines; the comments above mark where each goes). Then delete `HowTo.tsx` and its import in `LoadoutTab.tsx` (Task 4 removes the branch that used it; do Task 4's `LoadoutTab` edit in this commit if the type check needs it).

- [ ] **Step 4: Run it**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/help)`
Expected: PASS.

---

### Task 2: the Help dialog, in the system menu and the pause

**Files:**
- Create: `packages/client/src/features/delve/hub/help/HelpDialog.tsx`
- Modify: `packages/client/src/features/delve/hub/SystemMenu.tsx`, `packages/client/src/features/delve/hub/PauseScreen.tsx`
- Test: `packages/client/src/features/delve/hub/help/__tests__/HelpDialog.test.tsx` (new), `hub/__tests__/SystemMenu.test.tsx`, `hub/__tests__/PauseScreen.test.tsx`

- [ ] **Step 1: Write the failing tests.** `HelpDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { HelpDialog } from '../HelpDialog';

describe('HelpDialog', () => {
  it('is a kit dialog titled How to delve: the topics a sub tab list (LT/RT), one page at a time', () => {
    render(<HelpDialog onClose={vi.fn()} />);
    const dialog = screen.getByTestId('help-dialog');
    expect(within(dialog).getByRole('heading')).toHaveTextContent('How to delve');
    const list = within(dialog).getByRole('tablist', { name: 'Help topics' });
    expect(list).toHaveAttribute('data-pad-tabs', 'sub');
    expect(within(list).getAllByRole('tab').map((t) => t.dataset.testid)).toEqual([
      'help-topic-controls', 'help-topic-weapons', 'help-topic-skills',
      'help-topic-forge', 'help-topic-floor', 'help-topic-banking',
    ]);
    expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', 'controls');
    fireEvent.click(screen.getByTestId('help-topic-weapons'));
    expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', 'weapons');
    expect(screen.getByTestId('howto-carries')).toBeInTheDocument();
  });

  it('opens on the topic asked for; its page scrolls on the right stick; Back closes it', () => {
    const onClose = vi.fn();
    render(<HelpDialog onClose={onClose} topic="banking" />);
    expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', 'banking');
    expect(screen.getByTestId('delve-howto').closest('[data-pad-scroll]')).not.toBeNull();
    fireEvent.click(within(screen.getByTestId('help-dialog')).getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

  (Match the Back button's name to the kit `Dialog`'s, as plan 02's junk sheet test does.) In `SystemMenu.test.tsx` add: "Help opens How to delve in its place, and its Back comes back to the menu" (click `open-help`, see `help-dialog`, the menu gone; the dialog's Back; `system-menu` again), and in "opens focused on Resume"'s sibling for the wrap, nothing changes. In `PauseScreen.test.tsx`, the list test ("the list: Resume (the first focus), Build and quests, Controls, Settings, then the Anvil and Abandon…") expects `pause-help` after `open-settings` in the rows' order, and a new test: "Help opens over the pause, and Esc closes only it" (as the Controls and Settings test does).

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/help src/features/delve/hub/__tests__/SystemMenu.test.tsx src/features/delve/hub/__tests__/PauseScreen.test.tsx)`
Expected: FAIL.

- [ ] **Step 3: Implement.** `HelpDialog.tsx`:

```tsx
import { useState, type ReactElement } from 'react';
import { playSound } from '@/shared/utils/sound-manager';
import { Dialog, Tabs } from '@/features/delve/kit';
import { HELP_TOPICS, HelpPage, type HelpTopicId } from './help-topics';

/**
 * Help as a dialog (the pad-first spec, 4): How to delve, its topics a sub tab list (LT/RT, or a
 * click), one page at a time, the page scrolling on the right stick. From the system menu, the
 * pause, and once for a Jump in save as its mana is chosen.
 */
export function HelpDialog({ onClose, topic = 'controls' }: { onClose: () => void; topic?: HelpTopicId }): ReactElement {
  const [on, setOn] = useState<HelpTopicId>(topic);
  return (
    <Dialog title="How to delve" onClose={onClose} width={880} testId="help-dialog">
      <div className="flex flex-col gap-4">
        <Tabs
          aria-label="Help topics"
          level="sub"
          size="md"
          glyphs
          value={on}
          onChange={(t) => {
            playSound('buttonClick');
            setOn(t);
          }}
          tabs={HELP_TOPICS.map((t) => ({ id: t.id, label: t.title, testId: `help-topic-${t.id}` }))}
        />
        <div className="k-scroll max-h-[60vh] min-h-0" data-pad-scroll>
          <HelpPage topic={on} />
        </div>
      </div>
    </Dialog>
  );
}
```

  `SystemMenu.tsx`: the `view` union gains `'help'`; `if (view === 'help') return <HelpDialog onClose={() => setView('menu')} />;`; a row after Settings:

```tsx
        <Button onClick={() => setView('help')} testId="open-help">
          <Glyph id="journal" size={20} /> Help
        </Button>
```

  (`journal` is the glyph closest to a book in `glyph-art.ts`; if a `help` or `book` glyph exists by now, use it.) Its doc comment's list gains Help. `PauseScreen.tsx`: `dialog`'s union gains `'help'`, `{dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}`, and in `PauseList` a row after Settings, `testId="pause-help"`, `onClick={() => onDialog('help')}` (its `onDialog` type gains `'help'`). The pause's doc comment's list gains Help.

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub)`
Expected: PASS but the how-to tests Task 4 rewrites.

- [ ] **Step 5: Commit** (Tasks 1 and 2)

```bash
git add packages/client/src/features/delve/hub
git commit -m "feat(client): How to delve becomes Help, one topic a page, in the system menu and the pause"
```

---

### Task 3: the Codex's Help section

**Files:**
- Modify: `packages/client/src/features/delve/hub/types.ts` (the codex `section` union gains `'help'`)
- Modify: `packages/client/src/features/delve/hub/codex/CodexTab.tsx`
- Test: `packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx`

- [ ] **Step 1: Write the failing test.**

```tsx
  it('Help: one card a topic, the focused one\'s page in the detail; a link opens it', () => {
    open({ link: { tab: 'codex', section: 'help' } });
    expect(screen.getByTestId('codex-section-help')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId(/^help-card-/).map((c) => c.dataset.testid)).toEqual([
      'help-card-controls', 'help-card-weapons', 'help-card-skills',
      'help-card-forge', 'help-card-floor', 'help-card-banking',
    ]);
    // The first topic until one is focused or hovered.
    expect(within(screen.getByTestId('codex-detail')).getByTestId('delve-howto')).toHaveAttribute('data-topic', 'controls');
    fireEvent.focus(screen.getByTestId('help-card-floor'));
    expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', 'floor');
    // No progress bar: Help is not a collection.
    expect(within(screen.getByTestId('codex-sections')).queryByRole('progressbar')).toBeNull();
  });
```

  (`open` is the file's render helper; read it and pass `link` the way "a link opens its section" does. If the kit `Bar` has no `progressbar` role, assert on the `Bar`'s test id or class the records section's absence already uses.)

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/codex)`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `CodexTab.tsx`: the sections' `Tabs` gain `{ id: 'help', label: 'Help', testId: 'codex-section-help' }` last; the bar's guard becomes `section !== 'records' && section !== 'help'`; the grid gains

```tsx
        {section === 'help' && (
          <section className="flex flex-col gap-4" aria-label="Help">
            <span className="k-section">How to delve</span>
            <div className="grid grid-cols-2 gap-3">
              {HELP_TOPICS.map((t) => (
                <EntryCard
                  key={t.id}
                  active={(active ?? 'controls') === t.id}
                  onActive={() => setActive(t.id)}
                  icon={<Glyph id="journal" size={40} />}
                  name={t.title}
                  color="var(--k-text)"
                  caption="Help"
                  testId={`help-card-${t.id}`}
                />
              ))}
            </div>
          </section>
        )}
```

  and the detail `{section === 'help' && <div data-pad-scroll className="k-scroll min-h-0"><HelpPage topic={(active as HelpTopicId) ?? 'controls'} /></div>}` (an `active` left from another section is not a topic id: guard with `HELP_TOPICS.some((t) => t.id === active) ? active : 'controls'`). The doc comment's sections gain Help.

- [ ] **Step 4: Run it**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/codex)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub
git commit -m "feat(client): the Codex's Help section, a card a topic"
```

---

### Task 4: the Loadout's pane loses the how-to; Jump in meets Help once

**Files:**
- Modify: `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx`
- Modify: `packages/client/src/pages/DelveCamp.tsx`
- Test: `LoadoutTab.test.tsx`, `hub/__tests__/AnvilHub.test.tsx`, `tutorial/__tests__/GuidedChoice.test.tsx`, `pages/__tests__/DelveCamp.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  - `LoadoutTab.test.tsx`: "the compare pane shows the hovered item, else the selected one, else the how-to on a first save, else the worn weapon" becomes "…else the worn weapon": right after `open()`, `expect(screen.getByTestId('item-sheet')).toHaveTextContent('Your weapon')` and `expect(screen.queryByTestId('delve-howto')).toBeNull()`; its later `strike_the_anvil` block goes (the worn weapon shows either way). "how to delve stays for a save that skipped the tutorial mid-dive, never for a guided one" is deleted.
  - `AnvilHub.test.tsx`: "shows each tab: Loadout with the how-to…" drops its `delve-howto` line ("shows each tab: Loadout, Skills, Forge, Codex and Quests"); "the Loadout's attunement line opens Skills, and the how-to goes after the first lessons" drops its how-to line and its `strike_the_anvil` setup ("the Loadout's attunement line opens Skills"; with plan 01's `data-pad-skip` on the strip, the click still works). Plan 01's "a link wins over the memory, and a salvaged tile is forgotten" flips its last two lines to `expect(screen.getByTestId('item-sheet')).toHaveTextContent('Your weapon');`.
  - `GuidedChoice.test.tsx`: "Jump in leaves the save as it is and goes on to the mana choice, then How to delve" ends with `expect(screen.getByTestId('help-dialog')).toBeInTheDocument(); expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', 'controls');` and gains: closing it (the dialog's Back) leaves it closed, and choosing nothing more reopens nothing. "Guided start starts the tutorial…" asserts `queryByTestId('help-dialog')` is null where it read `delve-howto`.
  - `DelveCamp.test.tsx`: the two tests that click `guided-jump` read on after the mana choice; where either asserts the hub (a focus, `depart-button` not inert), close the Help dialog first (`fireEvent.click(within(screen.getByTestId('help-dialog')).getByRole('button', { name: /back/i }))`). Add: "a save with its mana already chosen never meets Help on its own" (render `DelveCamp` on `resetProfile(99, 'fire')`: no `help-dialog`).

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub src/features/delve/tutorial src/pages)`
Expected: FAIL on the new expectations.

- [ ] **Step 3: Implement.** `LoadoutTab.tsx`: `howTo` goes, and the third column is always

```tsx
      <ComparePane
        uid={target ?? profile.equipped.weapon?.uid ?? null}
        source={!target ? 'worn' : target === hovered ? 'hovered' : 'selected'}
        …
      />
```

  (the `ref={pane}` wrapper went in plan 01). `DelveCamp.tsx`:

```tsx
  // Jump in promises How to delve: it opens once, as the mana is chosen (this visit's answer).
  const [helpDue, setHelpDue] = useState(false);
  …
        (guided || jumped ? <ManaChoice /> : <GuidedChoice onJumpIn={() => { setJumped(true); setHelpDue(true); }} />)}
      {helpDue && !choosing && <HelpDialog onClose={() => setHelpDue(false)} />}
```

  and the page's doc comment gains: "after a Jump in, Help once its mana is chosen".

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: types clean; all passing.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): the Loadout's pane shows the worn weapon when nothing is focused; a Jump in save meets Help once"
```

---

### Task 5: the E2E

**Files:**
- Modify: `packages/client/e2e/delve.spec.ts` (D01, D08), `packages/client/e2e/delve-tutorial.spec.ts` (TU02)

- [ ] **Step 1: D01.** Its `await expect(page.getByTestId('delve-howto')).toBeVisible();` (line 21) becomes the menu's Help:

```ts
    await expect(page.getByTestId('item-sheet')).toContainText('Your weapon');
    await page.keyboard.press('Escape');
    await page.getByTestId('open-help').click();
    await expect(page.getByTestId('delve-howto')).toBeVisible();
    await page.keyboard.press('Escape'); // Help's Back: the menu
    await page.keyboard.press('Escape'); // the menu's Back
    await expect(page.getByTestId('system-menu')).toHaveCount(0);
```

  and the closing two lines ("How to delve stays until Strike the Anvil is claimed…") are deleted.

- [ ] **Step 2: D08 and TU02.** After `await expect(choice).toBeHidden();` (D08) and after `await page.getByTestId('mana-choice-fire').click();` (TU02):

```ts
    // Jump in promised How to delve: it opens once.
    await expect(page.getByTestId('help-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-dialog')).toHaveCount(0);
```

- [ ] **Step 3: Run them**

Run: `(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-tutorial.spec.ts --project=desktop -g "D01|D08|TU02")`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): How to delve is Help in the E2E; Jump in meets it once"
```
