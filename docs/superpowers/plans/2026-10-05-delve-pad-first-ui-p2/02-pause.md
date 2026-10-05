# The pause list Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu (and Esc) in a dive opens a short wrapping list over the dimmed arena (Resume, Build and quests, Controls, Settings, the guided start's skips when they apply, the Anvil and Abandon with their stakes) with the dive's state beside it. "Build and quests" opens today's read-only hub; the journal and a Found-log click open that hub directly. In the hub B returns to the list and Menu resumes; in the list Menu and B resume.

**Architecture:** `PauseScreen` keeps its props and its place in `DelveRun` (so `DelveRun`'s stub and memo tests hold) and holds one bit of state, the view: `'list'` (a kit `Dialog` with `wrap`, `pause-screen`) or `'hub'` (today's `Screen`, `pause-hub`). A `link` opens on the hub. The rows that were the hub's footer buttons move into the list; the hub's footer keeps its tab prompts and gains Back (to the list) and Resume. `DelveRun` passes the floor's rooms for the state panel.

**Tech Stack:** React 19, Vitest (jsdom), Playwright.

Read `00-overview.md` first (the `padPress` convention, the test-id table). Spec: section 3, "The pause list", with the overview's edit 2. Plan 01 is done.

How the buttons reach the list, with no new prompt: the `Dialog`'s Back (`data-pad-back`, drawn with Esc and B) is the list's B and Esc; the list holds no `[data-pad-menu]`, so the pad's Menu falls back to that Back (`use-gamepad-nav.ts`); `onClose={onResume}` makes all three resume. In the hub, the footer's Back carries `data-pad-back` (B, Esc) and Resume `data-pad-menu` (the pad's Menu). A tab's own B prompt (the Loadout's "Back to bag" with an item open) still takes B first, as at the Anvil. The keyboard's menu key, when rebound, does what Esc does in each place (the runtime presses the scope's back): in the hub that is the list, one more press resumes.

The guided start: no target lives in the pause. Its skip entries (`pause-skip-step`, `pause-skip-tutorial`) become rows of the list with the same test ids and the same props (`onSkipStep`, `onSkipTutorial`); Abandon stays disabled at a guided stop, now with its reason beside it.

---

### Task 1: `PauseScreen`, the list and the hub

**Files:**
- Modify: `packages/client/src/features/delve/hub/PauseScreen.tsx`
- Test: `packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx`

- [ ] **Step 1: Rewrite the tests.** Add to the file's imports `addMaterial, emptyHaul` from `@alloy/engine`, `padPrompts, scopedLast` from `../../kit/prompts`, `type PadButton` from `@/features/gamepad/gamepad`, and `SAMPLE_QUESTS` from `../../quests/__tests__/quest-fixture` (the mock already imports it inside its factory; import it at the top for the assertions). Add the same `padPress` helper as `StopScreen.test.tsx` (plan 01, Task 2), and:

```tsx
/** Open the read-only hub from the list. */
const toHub = () => fireEvent.click(screen.getByTestId('pause-build'));
```

  Then, by test name:
  - "is a pad scope: Paused, the floor, the tabs with the Forge locked, and the gear note" → call `toHub()` after `renderPause()`, and read `pause-hub` where it read `pause-screen`; the rest holds.
  - "over the stop, the floor reads cleared, not its foes" → `toHub()` first and read `pause-hub`'s header; add `expect(screen.queryByText(/foes left/)).toBeNull()` after going back (`padPress('b')`) so the state panel says so too.
  - "the footer: Inspect, Tabs and Full compare (the grammar order), then Controls, Settings, Anvil, Abandon and Resume" → two tests:

```tsx
  it('the list: Resume (the first focus), Build and quests, Controls, Settings, then the Anvil and Abandon with their stakes', () => {
    const on = renderPause();
    const list = screen.getByTestId('pause-screen');
    expect(list).toHaveAttribute('role', 'dialog');
    expect(list).toHaveAttribute('data-pad-wrap');
    expect(list.closest('[data-pad-scope]')).not.toBeNull();
    expect(screen.queryByTestId('pause-hub')).toBeNull();
    const rows = [...list.querySelectorAll<HTMLElement>('button[data-testid]')].map(
      (b) => b.dataset.testid,
    );
    expect(rows).toEqual([
      'pause-resume',
      'pause-build',
      'open-controls',
      'open-settings',
      'pause-anvil',
      'pause-abandon',
    ]);
    const resume = screen.getByTestId('pause-resume');
    expect(resume).toHaveFocus();
    expect(resume).toHaveClass('k-btn-lg');
    expect(resume).toHaveAttribute('data-primary-action', 'resume');
    const anvil = screen.getByRole('button', { name: /^Anvil · floor restarts/ });
    expect(anvil).toHaveTextContent("This floor's unbanked haul is lost");
    fireEvent.click(anvil);
    expect(on.onAnvil).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Abandon · counts as a death' }));
    expect(on.onAbandon).toHaveBeenCalledTimes(1);
    expect(on.onResume).not.toHaveBeenCalled();
  });

  it("the hub's footer: the tab's prompts and Tabs (the grammar order), then back to the list and Resume", () => {
    renderPause();
    toHub();
    const text = screen.getByTestId('pause-hub').querySelector('footer')!.textContent!;
    const order = ['Inspect', 'Tabs', 'Full compare', 'Pause menu', 'Resume'].map((s) => text.indexOf(s));
    expect(order.every((at, i) => at > (order[i - 1] ?? -1))).toBe(true);
    expect(screen.getByTestId('pause-back')).toHaveAttribute('data-pad-back');
    expect(screen.getByTestId('pause-hub-resume')).toHaveAttribute('data-pad-menu');
    expect(screen.queryByTestId('open-controls')).toBeNull();
  });
```

  - "Resume is hot metal on Esc / B / Menu and the first focus; Esc resumes" → "in the list B, Menu and Esc all resume":

```tsx
  it('in the list B (its Back), the pad\'s Menu and Esc all resume', () => {
    const on = renderPause();
    expect(screen.getByTestId('pause-screen').querySelector('[data-pad-menu]')).toBeNull();
    padPress('b');
    expect(on.onResume).toHaveBeenCalledTimes(1);
    padPress('menu');
    expect(on.onResume).toHaveBeenCalledTimes(2);
    press('Escape');
    expect(on.onResume).toHaveBeenCalledTimes(3);
  });
```

  - "the digits skip the locked Forge" → `toHub()` first.
  - "Controls and Settings open over the pause, and Esc closes only them" → unchanged (they are rows of the list now; the ids hold).
  - "a link opens on its item: the Found log's find, NEW, its actions locked" → add `expect(screen.getByTestId('pause-hub')).toBeInTheDocument(); expect(screen.queryByTestId('pause-screen')).toBeNull();`.
  - "while the guided start runs, the Anvil and Abandon restart the depth; Skip tutorial asks first" → unchanged (rows of the list).
  - "at the guided start's stop Abandon waits; Skip this step shows while the engine allows it" → add `expect(screen.getByTestId('pause-abandon')).toHaveAccessibleDescription('Not while the guided start runs');`.
  - "opens on Quests from the journal" → add `expect(screen.getByTestId('pause-hub')).toBeInTheDocument();`.

  And add:

```tsx
  it('in the hub B and Esc return to the list, its row focused, and the pad\'s Menu resumes', () => {
    const on = renderPause();
    toHub();
    expect(screen.getByTestId('pause-hub')).toHaveAttribute('data-pad-scope');
    expect(screen.queryByTestId('pause-screen')).toBeNull();
    padPress('b');
    expect(screen.getByTestId('pause-screen')).toBeInTheDocument();
    expect(screen.getByTestId('pause-build')).toHaveFocus();
    expect(on.onResume).not.toHaveBeenCalled();
    toHub();
    press('Escape');
    expect(screen.getByTestId('pause-screen')).toBeInTheDocument();
    expect(on.onResume).not.toHaveBeenCalled();
    toHub();
    padPress('menu');
    expect(on.onResume).toHaveBeenCalledTimes(1);
  });

  it('a link (the journal, a find) opens the hub directly; B from there is the list', () => {
    renderPause({ tab: 'quests' });
    expect(selected()).toEqual(['tab-quests']);
    padPress('b');
    expect(screen.getByTestId('pause-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('pause-hub')).toBeNull();
  });

  it('beside the list, the dive as it stands: depth, biome, rooms, banked, the death-loss line, the tracked objective', () => {
    const dive = store().profile.dive!;
    const banked = addMaterial({ ...emptyHaul(), scrap: 40 }, { kind: 'metal', metal: 'iron' }, 3);
    store().setProfile({ ...store().profile, dive: { ...dive, banked, bounty: 12 } });
    renderPause(undefined, false, { roomsExplored: 2, roomsTotal: 6 });
    const state = screen.getByTestId('pause-state');
    expect(state).toHaveTextContent(`Depth 1 · ${registry.getBiomeForDepth(1).name}`);
    expect(state).toHaveTextContent('Rooms explored 2 / 6');
    expect(state).not.toHaveTextContent('foes left');
    expect(state).toHaveTextContent('Banked 40 scrap · 3 materials · +12 bounty on extract');
    const loss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
    expect(state).toHaveTextContent(`Banked this dive · dying loses ${loss}% of it`);
    const quest = SAMPLE_QUESTS.find((q) => q.tracked && q.status !== 'claimed')!;
    expect(state).toHaveTextContent(`${quest.name}: ${quest.objectives.find((o) => !o.done)!.text}`);
  });

  it('on the open room the state counts the foes left, not rooms', () => {
    renderPause();
    expect(screen.getByTestId('pause-state')).toHaveTextContent('12 foes left');
  });
```

  `press` already gives every element a box; `padPress` does the same for its call. `toHub` swaps the `Dialog` (portalled to the UI layer) for the `Screen`: the file's `beforeEach` already removes a stale layer.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/PauseScreen.test.tsx)`
Expected: FAIL on every new and changed case (`pause-build`, `pause-hub`, `pause-state` not found; `pause-screen` is the hub).

- [ ] **Step 3: Implement.** `PauseScreen.tsx` becomes (`CAPTION` and `TABS_PROMPT` stay as they are):

```tsx
import { memo, useId, useRef, useState, type ReactElement } from 'react';
import type { BiomeDef, DiveState } from '@alloy/engine';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { Button, Dialog, Footer, Glyph, Header, Screen, usePrompts, type Prompt } from '../kit';
import { SkipTutorialConfirm } from '../tutorial/SkipTutorial';
import { getDelveRegistry } from '../registry';
import { formatNumber } from '../format';
import { materialCount, runeCount } from '../materials/material-style';
import { useQuests } from '../quests/useQuests';
import { objectiveCount } from '../quests/types';
import { useHubTabs } from './AnvilHub';
import { SettingsPanel } from './SettingsPanel';
import type { HubLink } from './types';

export interface PauseScreenProps {
  dive: DiveState;
  biome: BiomeDef;
  foesLeft: number;
  /** A generated floor's rooms explored, and its rooms (the HUD's map); absent on the open room. */
  roomsExplored?: number;
  roomsTotal?: number;
  /** The Found log's item, or { tab: 'quests' } from the journal: the hub opens on it, not the list. */
  link?: HubLink;
  /** Over the stop: back from the Anvil, the dive is still at the stop (nothing restarts). */
  atStop?: boolean;
  onResume: () => void;
  onAnvil: () => void; // floor restarts (its unbanked haul lost), or back to the stop
  onAbandon: () => void; // counts as a death: the bounty, the floor's haul and a share of the banked
  /**
   * While the guided start runs (see the tutorial spec): Skip tutorial, confirmed, drops it.
   * Mid-floor the Anvil and Abandon restart the depth as it was entered; at a stop Abandon waits.
   */
  onSkipTutorial?: () => void;
  /** "Skip this step", while the engine allows it (the pad's way to it from the fight). */
  onSkipStep?: () => void;
}

/**
 * The pause (the pad-first spec, 3): Menu or Esc in a dive opens a short list over the dimmed
 * arena, a kit dialog that wraps for the pad (`pause-screen`): Resume (the first focus), Build and
 * quests, Controls, Settings, the guided start's skips while they apply, then the Anvil and Abandon
 * with their stakes; beside it the dive as it stands (`PauseState`). Its Back, B, Esc and the pad's
 * Menu resume. Build and quests opens the hub's tabs read-only (`pause-hub`; a `link` opens there
 * directly), where B and Esc return to the list and Menu resumes.
 */
export const PauseScreen = memo(function PauseScreen(props: PauseScreenProps) {
  const { link, onResume, onSkipTutorial } = props;
  const [view, setView] = useState<'list' | 'hub'>(link ? 'hub' : 'list');
  /** Back from the hub, the list's focus is on Build and quests, the row that opened it. */
  const [fromHub, setFromHub] = useState(false);
  const [dialog, setDialog] = useState<'controls' | 'settings' | 'skip' | null>(null);
  return (
    <>
      {view === 'hub' ? (
        <PauseHub
          {...props}
          onBack={() => {
            setFromHub(true);
            setView('list');
          }}
        />
      ) : (
        <PauseList {...props} first={fromHub ? 'build' : 'resume'} onBuild={() => setView('hub')} onDialog={setDialog} />
      )}
      {dialog === 'controls' && <ControlsPanel onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsPanel onClose={() => setDialog(null)} />}
      {dialog === 'skip' && onSkipTutorial && (
        <SkipTutorialConfirm
          onConfirm={() => {
            setDialog(null);
            onSkipTutorial();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
});

/** The pause's list: the rows, and the dive's state beside them. */
function PauseList({
  first,
  onBuild,
  onDialog,
  ...props
}: PauseScreenProps & {
  first: 'resume' | 'build';
  onBuild: () => void;
  onDialog: (d: 'controls' | 'settings' | 'skip') => void;
}): ReactElement {
  const { atStop = false, onResume, onAnvil, onAbandon, onSkipStep, onSkipTutorial } = props;
  const guided = !!onSkipTutorial;
  const why = useId();
  const held = guided && atStop;
  const lead = (row: 'resume' | 'build') => (first === row ? '' : undefined);
  return (
    <Dialog title="Paused" onClose={onResume} width={960} wrap testId="pause-screen">
      <div className="flex gap-8">
        <div className="flex w-[400px] flex-none flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={onResume}
            data-pad-first={lead('resume')}
            data-primary-action="resume"
            testId="pause-resume"
          >
            Resume
          </Button>
          <Button onClick={onBuild} data-pad-first={lead('build')} testId="pause-build">
            <Glyph id="journal" size={20} /> Build and quests
          </Button>
          <Button onClick={() => onDialog('controls')} testId="open-controls">
            <Glyph id="controls" size={20} /> Controls
          </Button>
          <Button onClick={() => onDialog('settings')} testId="open-settings">
            <Glyph id="settings" size={20} /> Settings
          </Button>
          {onSkipStep && (
            <Button onClick={onSkipStep} testId="pause-skip-step">
              Skip this step
            </Button>
          )}
          {guided && (
            <Button onClick={() => onDialog('skip')} testId="pause-skip-tutorial">
              Skip tutorial
            </Button>
          )}
          <Button onClick={onAnvil} testId="pause-anvil">
            {atStop ? (
              'Anvil · back to this stop'
            ) : (
              <span className="flex flex-col items-start">
                Anvil · floor restarts
                <span className="k-caption" style={CAPTION}>
                  {guided ? 'The depth restarts as you entered it' : "This floor's unbanked haul is lost"}
                </span>
              </span>
            )}
          </Button>
          <Button
            variant="danger"
            onClick={onAbandon}
            disabled={held}
            aria-describedby={held ? why : undefined}
            testId="pause-abandon"
          >
            {guided ? 'Abandon · the depth restarts' : 'Abandon · counts as a death'}
          </Button>
          {held && (
            <span id={why} className="k-caption" style={CAPTION}>
              Not while the guided start runs
            </span>
          )}
        </div>
        <PauseState {...props} />
      </div>
    </Dialog>
  );
}

/**
 * The dive as it stands, beside the list: the depth and biome (cleared, over the stop), a generated
 * floor's rooms explored or the open room's foes left, what the dive has banked and the bounty, the
 * death-loss line, and the first tracked quest's next objective.
 */
function PauseState({
  dive,
  biome,
  foesLeft,
  roomsExplored,
  roomsTotal,
  atStop = false,
}: PauseScreenProps): ReactElement {
  const registry = getDelveRegistry();
  const { quests } = useQuests();
  const loss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
  const some = (k: number, one: string) => `${formatNumber(k)} ${one}${k === 1 ? '' : 's'}`;
  const kept = [
    dive.banked.scrap > 0 && `${formatNumber(dive.banked.scrap)} scrap`,
    materialCount(dive.banked) > 0 && some(materialCount(dive.banked), 'material'),
    runeCount(dive.banked.runes) > 0 && some(runeCount(dive.banked.runes), 'rune'),
  ].filter(Boolean);
  const quest = quests.find((q) => q.tracked && q.status !== 'claimed');
  const goal = quest?.objectives.find((o) => !o.done);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 text-[18px] text-[var(--k-text-2)]" data-testid="pause-state">
      <span className="k-disp text-[26px] text-[var(--k-text)]">
        Depth {dive.depth}
        {atStop && ' cleared'} · {biome.name}
      </span>
      {roomsTotal !== undefined ? (
        <span>
          Rooms explored {roomsExplored ?? 0} / {roomsTotal}
        </span>
      ) : (
        !atStop && <span>{some(foesLeft, 'foe')} left</span>
      )}
      <span>
        Banked {kept.length > 0 ? kept.join(' · ') : 'nothing yet'} · +{formatNumber(dive.bounty)} bounty on extract
      </span>
      <span className="text-[var(--k-hot)]">Banked this dive · dying loses {loss}% of it</span>
      {quest && (
        <span>
          {quest.name}: {goal ? `${goal.text} ${objectiveCount(goal)}`.trim() : 'Ready to claim'}
        </span>
      )}
    </div>
  );
}

/**
 * The hub's tabs, read-only, over the dimmed arena: the steel band names the floor, the tabs (the
 * Forge locked) and the gear lock; the planks hold the tab's prompts and Tabs, then the way back
 * to the list (B, Esc) and Resume (Menu).
 */
function PauseHub({
  dive,
  biome,
  foesLeft,
  link,
  atStop = false,
  onResume,
  onBack,
}: PauseScreenProps & { onBack: () => void }): ReactElement {
  const mainRef = useRef<HTMLDivElement>(null);
  const hub = useHubTabs('pause', onResume, link);
  const prompts: Prompt[] = [...hub.tabPrompts, TABS_PROMPT];
  usePrompts([...prompts, ...hub.digits], mainRef);
  return (
    // Over the HUD (z-20) and the banners (z-30).
    <div className="absolute inset-0 z-40">
      <Screen
        backdrop="arena-pause"
        headerStyle="band"
        testId="pause-hub"
        header={
          <Header
            title="Paused"
            subtitle={
              atStop
                ? `${biome.name} · Depth ${dive.depth} cleared`
                : `Depth ${dive.depth} · ${biome.name} · ${foesLeft} ${foesLeft === 1 ? 'foe' : 'foes'} left`
            }
            nav={hub.nav}
            aside={
              <span
                className="flex items-center gap-3 border-[3px] border-[var(--k-wood-1)] bg-[var(--k-wood-0)] px-3.5 py-2 text-[var(--k-wood-text)]"
                data-testid="pause-note"
              >
                <Glyph id="lock" size={20} /> Gear is locked until you are back at the Anvil
              </span>
            }
          />
        }
        footer={
          <Footer prompts={prompts}>
            <Button onClick={onBack} binding={{ key: 'Escape', pad: 'b' }} data-pad-back testId="pause-back">
              Pause menu
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={onResume}
              binding={{ pad: 'menu' }}
              data-pad-menu
              data-primary-action="resume"
              testId="pause-hub-resume"
            >
              Resume
            </Button>
          </Footer>
        }
      >
        <div ref={mainRef} className="h-full min-h-0">
          {hub.view}
        </div>
      </Screen>
    </div>
  );
}
```

  Check against the real kit before running: `Button` spreads unknown props (`data-pad-first`, `aria-describedby`) onto its `<button>` (the Depart sheet relies on it); `Glyph` has a `journal` id (`GlyphId` lists it). `useQuests` inside the list is the hook the test file mocks. The hub's subtitle and note are today's, unchanged.

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/PauseScreen.test.tsx)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub
git commit -m "feat(client): Menu in a dive opens the pause list (Resume, Build and quests, Controls, Settings, the Anvil, Abandon) beside the dive's state; the hub is one row away, B back to the list"
```

---

### Task 2: `DelveRun` passes the rooms

**Files:**
- Modify: `packages/client/src/pages/DelveRun.tsx`
- Test: `packages/client/src/pages/__tests__/DelveRun.test.tsx`

- [ ] **Step 1: Write the failing test** (in `DelveRun.test.tsx`; the arena mock's `hud` is null, so the props are absent, and a HUD tick keeps them so):

```tsx
  it("passes the pause the floor's rooms from the HUD's map (none on the open room), the same on every tick", () => {
    renderRun();
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    expect(seen.pause.at(-1)).toMatchObject({ roomsExplored: undefined, roomsTotal: undefined });
    expect(Object.keys(seen.pause.at(-1)!)).toEqual(expect.arrayContaining(['roomsExplored', 'roomsTotal']));
    act(() => seen.tick!());
    heldStill(seen.pause);
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx -t "floor's rooms")`
Expected: FAIL, the keys are absent.

- [ ] **Step 3: Implement.** In `DelveRun`'s `<PauseScreen …>`, after `foesLeft`:

```tsx
            roomsExplored={arena.hud?.map.floor?.explored}
            roomsTotal={arena.hud?.map.floor?.total}
```

  Two numbers, not an object, so the memo still skips a HUD tick that changed nothing ("a HUD tick hands the stop and the pause over it the same props" must keep passing).

- [ ] **Step 4: Run the page's tests**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/pages)`
Expected: types clean; all passing. `DelveRun.test.tsx` and `DelveRun.tutorial.test.tsx` stub `PauseScreen`, so the list does not reach them.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages
git commit -m "feat(client): the pause's state reads the floor's rooms explored"
```

---

### Task 3: the E2E through the list

**Files:**
- Modify: `packages/client/e2e/delve.spec.ts` (D02, D11)
- Modify: `packages/client/e2e/delve-gamepad.spec.ts` (G01)
- Modify: `packages/client/e2e/delve-quests.spec.ts` (Q01)
- Modify: `packages/client/e2e/delve-tutorial.spec.ts` (TU02)

The list is a `Dialog` portalled to the UI layer, outside `dive-pause`: a lookup scoped to `dive-pause` finds the hub, never the list. Find them: `grep -n "dive-pause\|pause-screen\|pause-resume\|pause-abandon\|Abandon ·" packages/client/e2e/*.spec.ts`. D01, D05 and D09 pass unchanged (Esc opens and closes the list; `open-controls` is a row), and so does G05 (Menu, the Controls row, B closes the editor, B resumes).

- [ ] **Step 1: The call sites.**
  - **D02** opens the pause from the Found log (the hub, on the item): after the `equip-locked` check, go back to the list and abandon there:

```ts
    await page.keyboard.press('Escape'); // the hub's Back: the list
    const list = page.getByTestId('pause-screen');
    await expect(list).toBeVisible();
    await list.getByRole('button', { name: 'Abandon · counts as a death' }).click();
```

  - **D11**: `page.getByTestId('dive-pause').getByRole('button', { name: 'Abandon · counts as a death' })` becomes `page.getByTestId('pause-screen').getByRole(…)`.
  - **Q01** and **TU02**: `page.getByTestId('dive-pause').getByTestId('pause-abandon')` becomes `page.getByTestId('pause-screen').getByTestId('pause-abandon')`.
  - **G01** is the pause by the pad; rename it "G01: Menu opens the pause list on Resume; A on Build and quests opens the hub, where RB steps the tabs past the Forge and B goes back; B and Menu resume; View opens the hub on Quests" and replace its body after the dive starts:

```ts
    await tap(page, BUTTON.menu);
    const pause = page.getByTestId('pause-screen');
    const resume = pause.getByTestId('pause-resume');
    await expect(pause).toBeVisible();
    // The pad has the input lock: the focus goes straight to Resume.
    await expect(resume).toBeFocused();
    await tap(page, BUTTON.down);
    await expect(pause.getByTestId('pause-build')).toBeFocused();
    await tap(page, BUTTON.a);
    const hub = page.getByTestId('pause-hub');
    await expect(hub.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(hub.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    // The Forge is locked mid-dive: RB steps over it.
    await tap(page, BUTTON.rb);
    await expect(hub.getByTestId('tab-codex')).toHaveAttribute('aria-selected', 'true');
    await expect(hub.getByTestId('tab-forge')).toHaveAttribute('aria-selected', 'false');
    // B: back to the list, on the row that opened the hub; B again resumes.
    await tap(page, BUTTON.b);
    await expect(pause.getByTestId('pause-build')).toBeFocused();
    await tap(page, BUTTON.b);
    await expect(pause).toBeHidden();
    // Menu opens it on Resume again; Menu resumes; and so does A on Resume.
    await tap(page, BUTTON.menu);
    await expect(resume).toBeFocused();
    await tap(page, BUTTON.menu);
    await expect(pause).toBeHidden();
    await tap(page, BUTTON.menu);
    await expect(resume).toBeFocused();
    await tap(page, BUTTON.a);
    await expect(pause).toBeHidden();
    // View, the journal, opens the hub on Quests directly; Menu there resumes.
    await tap(page, BUTTON.view);
    await expect(hub.getByTestId('tab-quests')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.menu);
    await expect(hub).toBeHidden();
```

    The spec's `BUTTON` comes from `e2e/fixtures/pad.ts`, which has `view` and `down`; if it is a local map without them, add `down: 13, view: 8`.

- [ ] **Step 2: Run them on one project**

Run: `(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-quests.spec.ts e2e/delve-tutorial.spec.ts --project=desktop)`
Expected: PASS (a long run: background it and read the report).

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): the E2E pauses through the list: Abandon is a row, Build and quests the hub, B back"
```
