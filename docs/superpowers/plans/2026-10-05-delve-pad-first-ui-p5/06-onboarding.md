# Onboarding: first-visit hints and folds Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kept small, as the spec asks.
- **Hints.** Five screens teach their main action on a first visit: the screen's main prompt pulses, with one line above the footer, until that action is done once on this device. Loadout (Equip), Skills (Edit move: a move's editor opened), Forge (Forge: an item forged), Quests (Claim), the stop (Take: a power-up taken). The seen flags live in `uiStore` (`alloy:delve:seen`, per device), never in the save.
- **Folds.** Systems the save holds none of stay folded on the Forge bench: no flux at all, and the Flux row is one line saying where flux drops (`forge-flux-none`), not a stepper over "None"; no shard at all, and the Lines are text with one line saying shards set them, not buttons into an empty picker.
- **Never against the guided start:** a guided save (`profile.tutorial !== null`) shows no hint and folds nothing (Hesta's lesson leads to `forge.flux` and `forge.shard`). An action done during the guided start still marks its hint done, so a save that finished the guided start sees no hint for what it already did. Nothing shows in the pause (its hub is read-only).

**Why these five, and only these.** They are the Anvil's four tabs that act (Codex only reads) and the stop, each with one main action the footer already names. The Depart sheet, Temper and Materials are reached from those and say what they do on their buttons. Five ids in one table: adding a sixth is one line.

**Why "holds none" folds, not "never met".** The profile keeps no history of every material, and a per-device "met" flag would fold the same save differently on two machines. The one line says where the thing drops, which helps whether the save never had flux or spent its last; the moment it holds one, the row is back. (Metal already works so: "Metal: none held. …".) The Materials bench already folds its sections the same way ("None yet: …"): untouched.

**Architecture:**
- `uiStore`: `seen: string[]` (loaded from `alloy:delve:seen`, a JSON array of strings; anything else: none), `markSeen(id)` (adds once, persists).
- `features/delve/onboarding.ts`: `ONBOARDING` (id → line), `OnboardingId`, `useOnboarding(id, active = true): { hint: string | undefined; done: () => void }`.
- The kit: `Prompt.hint?: string`. `PromptBar` marks a hinted prompt `data-pulse` (a CSS pulse; a still highlight under reduced motion). `Footer` draws the first hinted prompt's line above the plank (`onboarding-hint`), absolutely placed so no screen's layout moves (`pointer-events: none`).
- Each screen: its main prompt carries `hint`, and the function that does its action calls `done()` on success.

**Tech Stack:** React 19, Zustand, CSS, Vitest (jsdom), Playwright.

Read `00-overview.md` first.

---

### Task 1: the seen flags and `useOnboarding`

**Files:**
- Modify: `packages/client/src/stores/uiStore.ts`
- Create: `packages/client/src/features/delve/onboarding.ts`
- Modify: `packages/client/src/test-setup.ts`
- Test: `packages/client/src/features/delve/__tests__/onboarding.test.ts` (new)

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUIStore, loadSeen } from '@/stores/uiStore';
import { useDelveStore } from '@/stores/delveStore';
import { ONBOARDING, useOnboarding } from '../onboarding';

const store = () => useDelveStore.getState();

describe('onboarding hints', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ seen: [] });
    store().resetProfile(1234, 'fire');
  });

  it("shows a screen's line until its action is done once, then never again on this device", () => {
    const first = renderHook(() => useOnboarding('loadout'));
    expect(first.result.current.hint).toBe(ONBOARDING.loadout);
    act(() => first.result.current.done());
    expect(first.result.current.hint).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('alloy:delve:seen')!)).toEqual(['loadout']);
    // A later visit (and a reload: the store reads it back).
    expect(renderHook(() => useOnboarding('loadout')).result.current.hint).toBeUndefined();
    expect(loadSeen()).toEqual(['loadout']);
    // Another screen's is its own.
    expect(renderHook(() => useOnboarding('skills')).result.current.hint).toBe(ONBOARDING.skills);
  });

  it('shows nothing on a guided save, nor where the screen is read-only; done still counts there', () => {
    act(() => store().startTutorial());
    const guided = renderHook(() => useOnboarding('forge'));
    expect(guided.result.current.hint).toBeUndefined();
    act(() => guided.result.current.done()); // forged during the lesson
    act(() => store().skipTutorial());
    expect(renderHook(() => useOnboarding('forge')).result.current.hint).toBeUndefined();
    expect(renderHook(() => useOnboarding('quests', false)).result.current.hint).toBeUndefined();
  });

  it('reads a saved list, and anything else as none', () => {
    for (const [saved, seen] of [
      ['["stop","forge"]', ['stop', 'forge']],
      ['{"stop":true}', []],
      ['not json', []],
      [null, []],
    ] as const) {
      if (saved === null) localStorage.removeItem('alloy:delve:seen');
      else localStorage.setItem('alloy:delve:seen', saved);
      expect(loadSeen()).toEqual(seen);
    }
  });
});
```

  `resetProfile`, `startTutorial` and `skipTutorial` are the store's (the strip test calls `resetProfile(1234, 'fire')`; check the other two's names in `stores/delveStore.ts`, and that `skipTutorial()` takes no world off a floor).

- [ ] **Step 2: Run it** — `(cd packages/client && npx vitest run src/features/delve/__tests__/onboarding.test.ts)`. Expected: FAIL.
- [ ] **Step 3: `uiStore`.**

```ts
/** Delve UI: the onboarding hints done on this device (`alloy:delve:seen`): a JSON array of ids, anything else none. */
export function loadSeen(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem('alloy:delve:seen') ?? '[]');
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
```

  Field `seen: string[]` ("Delve UI: the first-visit hints whose action this device has done (`useOnboarding`)"), initial `loadSeen()`; `markSeen(id)`: if not already in, append, persist the array, set.
- [ ] **Step 4: `onboarding.ts`.**

```ts
import { useDelveStore } from '@/stores/delveStore';
import { useUIStore } from '@/stores/uiStore';

/**
 * The screens that teach their main action on a first visit (the pad-first spec, 6), each with
 * the one line it shows over its footer while its main prompt pulses.
 */
export const ONBOARDING = {
  loadout: 'Equip what is better: ▲ marks an upgrade as it comes, and salvage turns the rest into materials.',
  skills: "Open a move's editor to change its kind, form and elements; apply when the chain reads right.",
  forge: 'Pick a pattern, then its flux, metal and lines, and forge the item.',
  quests: 'Claim a finished quest for its rewards; track one to keep it on screen in the dive.',
  stop: 'Take one power-up, then choose your road: deeper, or home with the haul.',
} as const;

/** A screen with a first-visit hint. */
export type OnboardingId = keyof typeof ONBOARDING;

/**
 * A screen's first-visit hint: its line while this device hasn't done the screen's main action
 * (`uiStore.seen`), never on a guided save (Hesta teaches it) nor where `active` is false (the
 * pause's read-only hub). `done()` marks the action done, guided or not, so what the guided start
 * taught counts.
 */
export function useOnboarding(
  id: OnboardingId,
  active = true,
): { hint: string | undefined; done: () => void } {
  const seen = useUIStore((s) => s.seen.includes(id));
  const guided = useDelveStore((s) => s.profile.tutorial !== null);
  return {
    hint: active && !seen && !guided ? ONBOARDING[id] : undefined,
    done: () => useUIStore.getState().markSeen(id),
  };
}
```

- [ ] **Step 5: Unit tests meet no hint they didn't ask for.** In `src/test-setup.ts`, before anything imports the store:

```ts
// Every onboarding hint seen (features/delve/onboarding.ts): a test that wants one clears `seen`.
localStorage.setItem('alloy:delve:seen', JSON.stringify(['loadout', 'skills', 'forge', 'quests', 'stop']));
```

  (`uiStore` reads it once, at import; a test's `localStorage.clear()` later doesn't reset the store's state.) Without it every tab test would draw a hint sentence, and a `getByText(/Claim/)` would find two.
- [ ] **Step 6: Run it** — Expected: PASS.
- [ ] **Step 7: Commit**

```bash
git add packages/client/src/stores/uiStore.ts packages/client/src/features/delve/onboarding.ts packages/client/src/features/delve/__tests__/onboarding.test.ts packages/client/src/test-setup.ts
git commit -m "feat(client): onboarding's seen flags per device and useOnboarding: a screen's line until its action is done once, never on a guided save"
```

---

### Task 2: the kit draws it

**Files:**
- Modify: `packages/client/src/features/delve/kit/types.ts` (`Prompt.hint`)
- Modify: `packages/client/src/features/delve/kit/glyphs.tsx` (`PromptBar`)
- Modify: `packages/client/src/features/delve/kit/surfaces.tsx` (`Footer`)
- Modify: `packages/client/src/features/delve/kit/kit.css`
- Test: `packages/client/src/features/delve/kit/__tests__/surfaces.test.tsx`

- [ ] **Step 1: Write the failing test.**

```tsx
  it("a hinted prompt pulses, and its line sits over the footer; with none, nothing", () => {
    const prompts: Prompt[] = [
      { id: 'equip', label: 'Equip', binding: { pad: 'a' }, hint: 'Equip what is better.' },
      { id: 'lock', label: 'Lock', binding: { pad: 'y' } },
    ];
    const { rerender } = render(<Footer prompts={prompts} />);
    expect(screen.getByTestId('onboarding-hint')).toHaveTextContent('Equip what is better.');
    const pulsing = document.querySelectorAll('.k-prompt[data-pulse]');
    expect(pulsing).toHaveLength(1);
    expect(pulsing[0]).toHaveTextContent('Equip');
    rerender(<Footer prompts={prompts.map(({ hint: _, ...p }) => p)} />);
    expect(screen.queryByTestId('onboarding-hint')).toBeNull();
    expect(document.querySelector('[data-pulse]')).toBeNull();
  });
```

- [ ] **Step 2: Run it** — Expected: FAIL.
- [ ] **Step 3: The code.** `Prompt.hint?: string` ("Onboarding: this screen's first-visit line (`useOnboarding`); the prompt pulses while it shows."). `PromptBar`: both branches get `data-pulse={p.hint ? '' : undefined}`. `Footer`:

```tsx
  const hint = prompts.find((p) => p.hint)?.hint;
  return (
    <div className="k-footer" data-pad-group="">
      {hint && (
        <p className="k-footer-hint" data-testid="onboarding-hint">
          {hint}
        </p>
      )}
      <PromptBar prompts={prompts} />
      …
```

  `kit.css`:

```css
/* Onboarding's line (the pad-first spec, 6): over the plank, out of the layout, never in the way of a click. */
.k-screen-foot {
  position: relative;
}

.k-footer-hint {
  position: absolute;
  left: 32px;
  bottom: 100%;
  margin: 0 0 8px;
  padding: 6px 14px;
  font-size: 18px;
  color: var(--k-text);
  background: var(--k-well);
  border-left: 4px solid var(--k-hot-hi);
  pointer-events: none;
}

.k-prompt[data-pulse] {
  animation: k-pulse 1.4s ease-in-out infinite;
}

@keyframes k-pulse {
  50% {
    color: var(--k-hot-hi);
    filter: brightness(1.5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .k-prompt[data-pulse] {
    animation: none;
    color: var(--k-hot-hi);
  }
}
```

  Check the variable names against `kit.css`'s `:root` (`--k-hot-hi` and `--k-well` are used today). The pulse is infinite, which the responsive probe's settle step skips by design. `.k-screen-foot` gets `position: relative` here (check it has none that this changes); the stop's screen and the hub both use `Screen`, so both place the line the same way.
- [ ] **Step 4: Run it** — Expected: PASS (and the kit's other tests).
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/kit
git commit -m "feat(client): the kit draws an onboarding hint: the prompt pulses, its line over the footer"
```

---

### Task 3: the five screens

**Files:**
- Modify: `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/SkillsTab.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/ForgeBench.tsx`
- Modify: `packages/client/src/features/delve/hub/quests/QuestsTab.tsx`
- Modify: `packages/client/src/features/delve/stop/StopScreen.tsx`, `packages/client/src/features/delve/StopPanel.tsx`
- Test: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx`, `hub/loadout/__tests__/LoadoutTab.test.tsx` (or the Loadout test that renders its footer), `stop/__tests__/StopScreen.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `SkillsTab.test.tsx`, beside "draws its prompts in the hub's footer" and with the render that test uses:

```tsx
  it("a first visit pulses Edit move with its line, until a move's editor opens once", () => {
    useUIStore.setState({ seen: [] });
    store().setProfile(armed(store().profile));
    renderInHub(); // the render the footer test uses
    expect(screen.getByTestId('onboarding-hint')).toHaveTextContent(ONBOARDING.skills);
    expect(document.querySelector('.k-prompt[data-pulse]')).toHaveTextContent('Edit move');
    fireEvent.click(screen.getByTestId('move-0'));
    expect(screen.getByTestId('move-editor')).toBeInTheDocument();
    expect(useUIStore.getState().seen).toContain('skills');
    expect(screen.queryByTestId('onboarding-hint')).toBeNull();
  });
```

  In `StopScreen.test.tsx`, with its own render of a stop holding power-ups:

```tsx
  it('a first stop pulses Take with its line; a power-up taken ends it', () => {
    useUIStore.setState({ seen: [] });
    renderStop(); // the file's own
    expect(screen.getByTestId('onboarding-hint')).toHaveTextContent(ONBOARDING.stop);
    // Take one (the file's existing take test shows how: a card, its picker, its confirm).
    takeFirstPowerUp();
    expect(useUIStore.getState().seen).toContain('stop');
  });
```

  And one each for the Loadout (equip a bag item: `seen` gains `loadout`), the Forge bench (`ForgeBench.test.tsx`'s forge test: `seen` gains `forge`) and Quests (`QuestsTab` claim: `seen` gains `quests`), each two lines added to an existing test that already does the action, after `useUIStore.setState({ seen: [] })` at its start: `expect(screen.getByTestId('onboarding-hint')).toHaveTextContent(ONBOARDING.<id>)` before the action and `expect(useUIStore.getState().seen).toContain('<id>')` after. Name the tests you extend in the commit.

- [ ] **Step 2: Run them** — Expected: FAIL.
- [ ] **Step 3: Each screen.**
  - **Loadout** (`LoadoutTab.tsx`): `const { hint, done } = useOnboarding('loadout', mode === 'anvil');`. The `equip` prompt (both its pad and its keys form) gets `hint`, and `hint` joins the effect's dependencies. `actions.equip` (line ~62) calls `done()` once the store's equip succeeds; the take sheet's Transfer (wherever `transferMoveset` is called from the tab) calls it too.
  - **Skills** (`SkillsTab.tsx`): `const { hint, done } = useOnboarding('skills', mode === 'anvil');`. The home row's `edit` prompt gets `hint` (add `hint` to the `useMemo`'s dependencies). `onEdit` calls `done()` when it opens the editor (after `setEditing(true)`, so not when `!canEdit`).
  - **Forge** (`ForgeBench.tsx`): `const { hint, done } = useOnboarding('forge', !locked);`. Under the pad the hint rides `SELECT_PROMPT` (`{ ...SELECT_PROMPT, hint }`: A on the Forge button forges); under the keys, the `forge` prompt (Enter). `onForge` calls `done()` after `res.ok`.
  - **Quests** (`QuestsTab.tsx`): `const { hint, done } = useOnboarding('quests', mode === 'anvil' && !diving);`. The hint rides the `claim` prompt when it is in the list, else the select prompt (`SELECT_PROMPT` labelled "Claim" or "Select"). `onClaim` calls `done()` after `res.ok` (Claim all goes through `claimQuest` too: call it there on the first success).
  - **The stop** (`StopScreen.tsx`, `StopPanel.tsx`): `const { hint, done } = useOnboarding('stop');` in `StopScreen`; the step-1 `take` prompt gets `hint` (step 2's prompts none: a stop that opens on step 2 has nothing to take). `StopPicker`'s `take` (`StopPanel.tsx` ~208) calls `done()` on `res.ok`: pass it down as `onTaken`'s companion, or call `useUIStore.getState().markSeen('stop')` there directly (the alcove's dialog shares the picker: a power-up taken at an alcove counts too).
- [ ] **Step 4: Run them** — Expected: PASS; then each touched tab's whole test folder.
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve
git commit -m "feat(client): Loadout, Skills, Forge, Quests and the stop pulse their main prompt on a first visit, until it is done once"
```

  Before it: `(cd packages/client && npx vitest related --run <the five screens' files>)`.

---

### Task 4: the Forge bench's folds

**Files:**
- Modify: `packages/client/src/features/delve/hub/forge/ForgeBench.tsx`
- Test: `packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx`

- [ ] **Step 1: Write the failing test.**

```tsx
  it('a save with no flux sees one line for Flux, and with no shard the Lines as text; a guided save folds nothing', () => {
    setMaterials(); // the file's helper: emptyMaterials() and the starting bars, no flux, no shard
    renderBench(); // the file's render
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(screen.queryByTestId('forge-flux')).toBeNull();
    expect(screen.getByTestId('forge-flux-none')).toHaveTextContent(`Flux: none held. ${DROPS_FROM.flux}`);
    expect(screen.queryByTestId('shard-slot-0')).toBeNull(); // a common cuirass rolls no lines anyway
    cleanup();
    // Uncommon flux and still no shard: the flux row is back, the line is text.
    setMaterials({ flux: { ...emptyMaterials().flux, uncommon: 1 } });
    renderBench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(screen.getByTestId('forge-flux')).toBeInTheDocument();
    stepToUncommon(); // as the file's flux tests step it
    expect(screen.queryByTestId('shard-slot-0')).toBeNull();
    expect(screen.getByTestId('forge-line-0')).toHaveTextContent(/^Line 1 · Random/);
    expect(screen.getByTestId('forge-lines-none')).toHaveTextContent(DROPS_FROM.shard);
    cleanup();
    // Guided: today's rows, flux or not.
    act(() => store().startTutorial());
    setMaterials();
    renderBench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(screen.getByTestId('forge-flux')).toBeInTheDocument();
  });
```

  Read the file's helpers first (line ~31 builds `materials: { ...emptyMaterials(), ...over }`; use its names for `setMaterials`, `renderBench` and the flux step). If `startTutorial` puts the save into a state where `ForgeBench` is `locked`, use `store().setProfile({ ...store().profile, tutorial: { step: '<the first anvil step id>', count: 0, misses: 0 } })` instead.

- [ ] **Step 2: Run it** — Expected: FAIL.
- [ ] **Step 3: The folds.** In `ForgeBench`: `const guided = useDelveStore((s) => s.profile.tutorial !== null);`, `const anyFlux = FLUX_GRADES.some((g) => fluxHeld[g] > 0);`, `const anyShard = Object.values(profile.materials.shards).some((ns) => ns?.some((n) => n > 0));`.
  - The Flux `Stepper` renders when `anyFlux || guided`; else `<p className="k-note" data-testid="forge-flux-none">Flux: none held. {DROPS_FROM.flux}</p>` (Metal's pattern).
  - The Lines: when `anyShard || guided`, the `shard-slot-<i>` buttons as today; else each line as `<p className="k-well flex items-center justify-between gap-3 p-2" data-testid={\`forge-line-${i}\`}>` with the same text ("Line n · Random", "rolls a–b%"), then one `<p className="k-note" data-testid="forge-lines-none">Shards set a line: {DROPS_FROM.shard}</p>`. The container keeps `data-tutorial="forge.shard"` and its `data-tutorial-done`.
  - **The focus after a pattern** (line ~142: "A pattern picked puts the focus on the Flux row") queries `[data-testid="forge-flux"]`: with the row folded, the first stepper in the rows: `rowsRef.current?.querySelector<HTMLElement>('[data-testid="forge-flux"], [role="spinbutton"]')` (the Flux row comes first when it is there).
- [ ] **Step 4: The tests that encode today's rows** (`ForgeBench.test.tsx`; its default materials hold no flux and no shard, so they now fold):
  - › "the bench is rows: Flux, Metal and Element steppers over what the save holds, then the Lines, then Forge": give it uncommon flux (`flux: { …, uncommon: 1 }`) so it still reads the three steppers; the fold has its own test now.
  - › "what the save lacks is one line under its row, saying where it drops": its flux part reads `forge-flux-none` with no flux; keep its metal part.
  - › "carries the guided start's trail: …": runs on a guided save? If not, give it flux; the trail's targets hold only on a guided save, which folds nothing.
  - › "the Lines field is done at once when no shard held fits the item": with no shard at all the field is text; give it one shard of a family the slot can't take (the test's point), so the buttons show.
  - › "a pattern picked moves the focus to the Flux row; …": give it flux (its point is the Flux row).
  - The rest give flux or shards already.
- [ ] **Step 5: Run it** — `(cd packages/client && npx vitest run src/features/delve/hub/forge)`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/delve/hub/forge
git commit -m "feat(client): the Forge bench folds what the save holds none of: one line for Flux, the Lines as text without a shard"
```

---

### Task 5: the E2E

**Files:**
- Modify: `packages/client/e2e/fixtures/delve.ts` (`seedProfile` marks every hint seen; `showOnboarding`)
- Modify: `packages/client/e2e/delve.spec.ts` (D11, new)
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts` (PN04 and PN07: the audit save holds no flux)

- [ ] **Step 1: The fixtures.** In `seedProfile`'s init script, after `localStorage.clear()`: `localStorage.setItem('alloy:delve:seen', '["loadout","skills","forge","quests","stop"]'); // every onboarding hint seen (features/delve/onboarding.ts): a test that wants them calls showOnboarding`. And:

```ts
/** The onboarding hints back, for the test that reads them. Call after `seedProfile`; once a session, like it, so a reload keeps what the test did. */
export async function showOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('delve-e2e-onboarding')) return;
    localStorage.removeItem('alloy:delve:seen');
    sessionStorage.setItem('delve-e2e-onboarding', '1');
  });
}
```

- [ ] **Step 2: D11.**

```ts
  test('D11: a first visit pulses its main prompt with a line over the footer, gone once that is done, and after a reload', async ({ page }) => {
    await seedProfile(page, 4242, false);
    await showOnboarding(page);
    await page.goto('/delve');
    await page.getByTestId('tab-skills').click();
    const hint = page.getByTestId('onboarding-hint');
    await expect(hint).toContainText("Open a move's editor");
    await expect(page.locator('.k-prompt[data-pulse]')).toContainText('Edit move');
    await page.getByTestId('move-0').click();
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await page.getByTestId('move-editor-back').click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await page.getByTestId('tab-skills').click();
    await expect(page.getByTestId('move-0')).toBeVisible();
    await expect(hint).toHaveCount(0);
    // Another screen's hint is its own.
    await page.getByTestId('tab-quests').click();
    await expect(hint).toContainText('Claim a finished quest');
  });
```

- [ ] **Step 3: PN04 and PN07.** The audit save holds no flux (PN04's own comment: "The save holds no flux (None alone)"), so A on a pattern now lands on the Metal row:
  - PN04: `expect((await where(page)).id).toBe('forge-flux');` and the `down` to `forge-metal` become `expect((await where(page)).id).toBe('forge-metal');` with the comment "The save holds no flux: its row is one line, and A lands on the Metal row".
  - PN07: `await expect(page.getByTestId('forge-flux')).toBeFocused();` and the `flux` step become: the first row focused (`forge-flux` if the save holds flux, else `forge-metal`), and `const flux = (await page.getByTestId('forge-flux').count()) > 0 && (await page.getByTestId('forge-flux').getAttribute('aria-valuemax')) !== '0' ? 1 : 0;`. The forge budget can only fall.
  - PN01's `forge-pattern` count falls by the Flux row (and the line buttons if the audit save holds no shard): `CEILING['forge-pattern']` and the Evidence's 14 drop in plan 07; a rise is a bug here.
- [ ] **Step 4: Run** (with plan 07 next by the same agent, plan 07's full run covers these; still run D11 and the pad audit here):

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-06.txt" 2>&1; tail -n 15 "$SCRATCH/unit-06.txt")
(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-pad-nav.spec.ts e2e/delve-quests.spec.ts e2e/delve-tutorial.spec.ts --project=desktop --project=desktop-1080 --reporter=line > "$SCRATCH/e2e-06.txt" 2>&1; tail -n 30 "$SCRATCH/e2e-06.txt")
```

  Expected: the unit suite at the baseline plus every plan's tests so far, all passing; the four specs PASS on both projects (`desktop-1080` because the footer gained a line and the bench folds; the pad audit because the Forge's stops changed; the tutorial spec because a guided save must fold nothing and show no hint, and its lesson forges through `forge-flux` and `shard-slot-0`). Known flakes: D02 and Q01 alone once.
- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): D11 walks a first-visit hint to its end; the pad walks land on the Metal row when no flux is held"
```
