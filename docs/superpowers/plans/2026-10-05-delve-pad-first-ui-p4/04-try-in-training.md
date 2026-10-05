# Try in Training Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an unapplied build can be tried before it is paid for. The Apply sheet's **Try in Training** loads the draft into the Training Grounds as Load my build loads the worn build (the draft's chains on the worn weapon, the other gear, the pair), opens the Training Grounds, and the Training Grounds' way back (◂ Anvil, the system menu's Anvil) returns to the Skills tab on the same skill, the draft as it was.

**What the code already settles** (read, not assumed):
- The draft lives in the delve store (`chainDraft`), in memory, keyed on the weapon's uid and the pair (`draftChanges`). Navigating to `/delve/training` and back commits no profile with another weapon, so nothing drops it (`commit` drops it only when the worn weapon's uid changes; the Training Grounds touch the save only through `tutorialEvents`, with the same weapon).
- `useSandboxStore.loadMyBuild(profile: Pick<DelveProfile, 'equipped' | 'pair'>)` reads the chains through `heroChains(registry, profile.equipped, profile.pair)`, i.e. from the worn weapon's `moveset`. So a draft loads without applying it: hand it `{ pair, equipped }` with the weapon's moveset holding the draft's chains. That is what `useAnvilChains` already builds for the builder's stats; this plan names it (`draftEquipped`) and uses it twice. The sandbox is unrestricted (any rune, any element), so a draft the engine would refuse (a rune short) still loads.
- `loadMyBuild` replaces the sandbox's saved loadout (`alloy:delve:sandbox:v1`), as the dock's own Load my build does. That is accepted (spec edit 5): the sheet's button says "Try in Training" and its line says "Loads this build into the Training Grounds".
- The Anvil opens on the Loadout today (`useHubTabs`' `initial` is never passed). The way back carries a `HubLink` in the router's state: `/delve/training` takes `{ back }`, `/delve` takes `{ link }`, and `AnvilHub` passes it as `initial`.

**Architecture:** `draftEquipped` in `useAnvilChains.ts`; the sheet's button in `ApplySheet.tsx` (plan 03 left its place); `DelveTraining`'s `exit` navigates with the link it came with; `AnvilHub` reads the router state once.

**Tech Stack:** React 19, React Router 7, Zustand, Vitest (jsdom), Playwright.

Read `00-overview.md` first. Plan 03 is done.

---

### Task 1: the draft on the worn weapon

**Files:**
- Modify: `packages/client/src/features/delve/hub/skills/useAnvilChains.ts`
- Test: `packages/client/src/features/delve/hub/skills/__tests__/draft-equipped.test.ts` (new)

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { createDelveProfile, heroChains, type Chains } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { armed } from '../../../__tests__/armed';
import { draftEquipped } from '../useAnvilChains';

const registry = getDelveRegistry();

describe('draftEquipped', () => {
  it("puts the draft's chains on the worn weapon, so heroChains reads them; the rest of the gear is as worn", () => {
    const p = armed(createDelveProfile(registry, 1234, { primary: 'fire' }));
    const saved = heroChains(registry, p.equipped, p.pair) as Chains;
    const primary = { ...saved.primary, moves: [{ ...saved.primary.moves[0], form: 'lance' as const }] };
    const equipped = draftEquipped(registry, p.equipped, { ...saved, primary });
    expect(heroChains(registry, equipped, p.pair).primary).toEqual(primary);
    expect(equipped.weapon!.uid).toBe(p.equipped.weapon!.uid);
    expect(equipped.chest).toBe(p.equipped.chest);
    // The save's own weapon is untouched.
    expect(heroChains(registry, p.equipped, p.pair).primary!.moves[0].form).toBe('bolt');
  });

  it('unarmed, the gear is as worn', () => {
    const p = createDelveProfile(registry, 1234, { primary: 'fire' });
    const bare = { ...p.equipped, weapon: undefined };
    expect(draftEquipped(registry, bare, {})).toBe(bare);
  });
});
```

  If `createDelveProfile` takes its options differently, copy the call from `draft-lines.test.ts` (plan 03).

- [ ] **Step 2: Run it** — Expected: FAIL (`draftEquipped` not exported).

- [ ] **Step 3: The code.** In `useAnvilChains.ts`:

```ts
/**
 * The worn gear with the weapon holding `chains` (the builder's: the saved chains with the
 * draft's over them): what the builder's stats resolve against, and what Try in Training loads
 * into the sandbox. Unarmed, the gear as worn.
 */
export function draftEquipped(
  registry: DataRegistry,
  equipped: EquippedGear,
  chains: Partial<Chains>,
): EquippedGear {
  const weapon = equipped.weapon;
  if (!weapon) return equipped;
  return { ...equipped, weapon: { ...weapon, moveset: { ...movesetOf(registry, weapon), chains } } };
}
```

  and the hook's `stats` becomes `profileStats(registry, { pair, equipped: draftEquipped(registry, equipped, chains) })` (the same object as before, named). Import `DataRegistry` and `EquippedGear` types from `@alloy/engine`.

- [ ] **Step 4: Run it** — Expected: PASS; and `npx vitest run src/features/delve/hub/skills` stays green (the stats are unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/skills/useAnvilChains.ts packages/client/src/features/delve/hub/skills/__tests__/draft-equipped.test.ts
git commit -m "refactor(client): draftEquipped names the worn gear with the draft's chains on the weapon"
```

---

### Task 2: the sheet's Try in Training, and the way back

**Files:**
- Modify: `packages/client/src/features/delve/hub/skills/ApplySheet.tsx`
- Modify: `packages/client/src/pages/DelveTraining.tsx`
- Modify: `packages/client/src/features/delve/hub/AnvilHub.tsx`
- Test: `packages/client/src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx`
- Test: `packages/client/src/pages/__tests__/DelveTraining.test.tsx`
- Test: `packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx`

- [ ] **Step 1: Write the failing tests.**

  `ApplySheet.test.tsx` (mock `useNavigate` at the file's top, as `SkillsTab.chains.test.tsx` does: `const mockNavigate = vi.fn(); vi.mock('react-router', async () => ({ ...(await vi.importActual('react-router')), useNavigate: () => mockNavigate }));`, and `mockNavigate.mockClear()` in `beforeEach`):

```tsx
  it('Try in Training loads the draft into the sandbox, unapplied, and opens the Training Grounds with the way back to this skill', () => {
    localStorage.removeItem(SANDBOX_KEY);
    draftLance();
    renderSheet();
    fireEvent.click(screen.getByTestId('apply-sheet-try'));
    const sandbox = useSandboxStore.getState();
    expect(sandbox.chains.primary.moves[0].form).toBe('lance');
    expect(sandbox.loadedWeapon?.uid).toBe(store().profile.equipped.weapon!.uid);
    expect(sandbox.primary).toBe('fire');
    // The draft stays a draft: the save is untouched, the draft as it was.
    expect(chains().primary.moves[0].form).toBe('bolt');
    expect(store().chainDraft?.chains.primary?.moves[0].form).toBe('lance');
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training', {
      state: { back: { tab: 'skills', skill: 'primary' } },
    });
  });

  it('Try in Training loads a draft the engine would refuse too: the sandbox is free', () => {
    const primary = chains().primary;
    act(() =>
      store().editDraft('primary', {
        ...primary,
        moves: primary.moves.map((m) => ({ ...m, runes: [{ id: 'split', tier: 1 as const }] })),
      }),
    );
    renderSheet();
    expect(screen.getByTestId('apply-sheet-try')).toBeEnabled();
    fireEvent.click(screen.getByTestId('apply-sheet-try'));
    expect(useSandboxStore.getState().chains.primary.moves[0].runes).toEqual([{ id: 'split', tier: 1 }]);
  });
```

  (`useSandboxStore`, `SANDBOX_KEY` from `@/stores/sandboxStore`.)

  `DelveTraining.test.tsx` (read its harness: it renders the page in a `MemoryRouter` with `Routes`; give that render an `initialEntries` entry with state, and watch where ◂ Anvil goes by a `/delve` route that prints `useLocation().state`):

```tsx
  it("its way back to the Anvil carries the link it came with (Try in Training's skill)", () => {
    function Anvil() {
      const state = useLocation().state as { link?: unknown } | null;
      return <div data-testid="anvil-state">{JSON.stringify(state)}</div>;
    }
    render(
      <MemoryRouter initialEntries={[{ pathname: '/delve/training', state: { back: { tab: 'skills', skill: 'ultimate' } } }]}>
        <Routes>
          <Route path="/delve/training" element={<DelveTraining />} />
          <Route path="/delve" element={<Anvil />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('training-back'));
    expect(screen.getByTestId('anvil-state')).toHaveTextContent('{"link":{"tab":"skills","skill":"ultimate"}}');
  });
```

  If the file mocks `useNavigate`, assert the mock's call instead: `('/delve', { state: { link: { tab: 'skills', skill: 'ultimate' } } })`; and add the plain case: with no state, `('/delve', undefined)` (or the route's state is `null`).

  `AnvilHub.test.tsx`:

```tsx
  it("opens on the tab the router state's link names (the way back from Try in Training)", () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/delve', state: { link: { tab: 'skills', skill: 'primary' } } }]}>
        <AnvilHub mode="anvil" />
      </MemoryRouter>,
    );
    expect(selected()).toEqual(['tab-skills']);
    expect(screen.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
  });
```

  (`selected()` is the file's helper; if it returns labels rather than ids, compare with what its other tests compare.)

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: The sheet's button.** In `ApplySheet.tsx`, in place of plan 03's comment:

```tsx
          <Button
            variant="secondary"
            onClick={() => {
              const s = useDelveStore.getState();
              useSandboxStore.getState().loadMyBuild({
                pair: s.profile.pair,
                equipped: draftEquipped(registry, s.profile.equipped, editor.chains),
              });
              onClose();
              navigate('/delve/training', { state: { back: { tab: 'skills', skill } satisfies HubLink } });
            }}
            title="Loads this build into the Training Grounds, unapplied"
            testId="apply-sheet-try"
          >
            Try in Training
          </Button>
```

  with `const navigate = useNavigate();` (`react-router`), `useSandboxStore` from `@/stores/sandboxStore`, `draftEquipped` from `./useAnvilChains`, `HubLink` from `../types`. Under the buttons, one `k-caption` line: "Try in Training loads this build into the Training Grounds without applying it." The button is never disabled: the sandbox takes any draft.

- [ ] **Step 4: The way back.** `DelveTraining.tsx`:

```tsx
  const location = useLocation();
  // Try in Training's way back: the Anvil opens on the Skills tab it came from.
  const back = (location.state as { back?: HubLink } | null)?.back;
  const exit = useCallback(
    () => navigate('/delve', back ? { state: { link: back } } : undefined),
    [navigate, back],
  );
```

  `AnvilHub.tsx`:

```tsx
  const location = useLocation();
  // A link the route brings (Try in Training's way back), read once.
  const [initial] = useState(() => (location.state as { link?: HubLink } | null)?.link);
  …
  const hub = useHubTabs(mode, openDepart, initial);
```

  (`useLocation` from `react-router`; `HubLink` from `./types`.) A reload keeps the history entry's state and reopens Skills: harmless, and not cleared.

- [ ] **Step 5: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx src/pages/__tests__/DelveTraining.test.tsx src/features/delve/hub/__tests__/AnvilHub.test.tsx)`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): Try in Training loads the unapplied draft into the sandbox; the way back opens Skills on the same skill, the draft intact"
```

---

### Task 3: the E2E

**Files:**
- Modify: `packages/client/e2e/delve-training.spec.ts`

- [ ] **Step 1: T04.** After T03 (`seedProfile`, `stepTo` from `./fixtures/delve`; read the spec's imports and add what is missing):

```ts
  test('T04: Try in Training loads the unapplied draft into the Training Grounds, and the way back finds it as it was', async ({
    page,
  }) => {
    await seedProfile(page, 4242, false); // an uncommon sword: it carries the Primary
    await page.goto('/delve');
    await page.getByTestId('tab-skills').click();
    await page.getByTestId('move-0').click();
    await stepTo(page, 'move-kind', /^Heavy$/);
    await page.getByTestId('move-editor-back').click();
    await page.getByTestId('chain-apply').click();
    await page.getByTestId('apply-sheet-try').click();
    await expect(page).toHaveURL(/\/delve\/training$/);
    await expect(page.getByTestId('training-bar')).toBeVisible();
    const read = (key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
    expect((await read('alloy:delve:sandbox:v1')).chains.primary.moves[0].kind).toBe('heavy');
    expect((await read('alloy:delve:v2')).equipped.weapon.moveset.chains.primary.moves[0].kind).toBe('light');
    // The way back: the Skills tab on the Primary, one change still unapplied.
    await page.getByTestId('training-back').click();
    await expect(page.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('chain-price')).toContainText('1 unapplied change');
  });
```

  `light` is the armed sword's first Primary move as seeded; if the seed's first move is another kind, step to one it isn't and assert the seed's.

- [ ] **Step 2: The plan's end.**

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-04.txt" 2>&1; tail -n 15 "$SCRATCH/unit-04.txt")
(cd packages/client && npx playwright test e2e/delve-training.spec.ts --project=desktop --reporter=line > "$SCRATCH/e2e-04.txt" 2>&1; tail -n 20 "$SCRATCH/e2e-04.txt")
```

  Expected: green. No layout or stop changed but the sheet's one button (plan 06's audit counts it), so `desktop` and this one spec.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/delve-training.spec.ts
git commit -m "test(client): T04 tries an unapplied build in the Training Grounds and comes back to it"
```
