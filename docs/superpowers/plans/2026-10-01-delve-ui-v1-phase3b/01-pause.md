# Delve UI v1 · Phase 3b · 3D: The pause — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dive's pause: `PauseScreen`, the Anvil hub's tabs read-only over the dimmed arena, with a steel band ("Paused", "Depth N · biome · n foes left", the tabs with the Forge locked, the gear note) and plank footer (Inspect, Full compare and Tabs prompts, then Controls, Settings, "Anvil · floor restarts", "Abandon · lose bounty" and the hot-metal Resume on Esc / B / Menu, the pad's first focus). The basic attack's Auto / Manual moves into the Controls panel, the compare pane's locked note reads "Locked during the dive", and `ItemDetailSheet` is deleted.

**Architecture:** The hub's tab plumbing moves out of `AnvilHub` into an exported hook in the same file, `useHubTabs(mode, onDelve, initial?)`: the open tab and its link, the tab's prompts and footer action, the header's `Tabs` (`nav`), the open tab's view (`view`) and the digit prompts (`digits`). `AnvilHub` keeps its header, footer and system menu around it, unchanged in behaviour; `PauseScreen` puts its own header and footer around the same hook with `mode: 'pause'` (the Forge disabled with the title "Forge at the Anvil", so LB/RB and the digits skip it). The tabs already honour `mode: 'pause'` (Phase 2): Loadout's actions give way to the locked note and its prompts to Inspect and Full compare, the bag's NEW tags mark the dive's finds (`newUids`, which the dive's banking fills), Skills sets no footer action and its editor is locked by `isDiveActive`. No engine change, no store change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md`: "3b · Pause, stop and Training" → **3D** (`PauseScreenProps` verbatim, the header, tabs and footer, the retired kebab, the deletion) and its E2E list (D01, D02, D05, G01, G05); decided items 16 (`ItemDetailSheet` retired), 18 (Auto / Manual in Controls), 19 (Esc / Menu ownership), 26 (`data-pad-first`), 15 (disabled tabs skipped); the input map's "Pause" and "Full compare"; Phase 2's hub contract (`HubTabProps`, `mode: 'pause'`). Mockup: `Pause.dc.html`. The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** branch `ui/p3b` (v0.56.0, `cd13060`), in this area's worktree `C:/Projects/alloy-ui-p3b-3d` on branch `ui/p3b-3d`, made with the session's `mkwt.ps1` (`powershell -File <scratchpad>/mkwt.ps1 -Name alloy-ui-p3b-3d -Branch ui/p3b-3d -Base ui/p3b`; it junctions `node_modules`). Every path below is relative to the worktree root, `/c/Projects/alloy-ui-p3b-3d` in Git Bash.
- **Nothing has to merge first** for Tasks 1–4. **Task 5** (deleting `ItemDetailSheet`) needs 3E's `DelveRun.tsx`, which drops its last importer: run it on `ui/p3b-3d` after 3E merges into `ui/p3b` and `ui/p3b` merges into `ui/p3b-3d`, or hand it to the integrator to run on `ui/p3b` (see "Cross-area needs").
- **Before Task 1:** build the engine once for the junction and measure the client:

```bash
cd /c/Projects/alloy-ui-p3b-3d
(cd packages/engine && npx tsup)
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
```

  Expected: tsup's "Build success" lines; the suite passes and the typecheck prints nothing. `ui/p3b` at `cd13060` reads **1146 tests in 145 files**. Call the measured counts **N tests in F files**. Tasks 1–4 end at **N + 8 tests in F + 1 files**; Task 5 at **N − 10 tests in F files** (it deletes `ItemDetailSheet.test.tsx`'s 18).

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/hub/PauseScreen.tsx` (new) | `PauseScreenProps` (the spec's, verbatim) and `PauseScreen`: the kit `Screen` (`arena-pause`, band) with the pause header and footer around `useHubTabs('pause', …)`; Controls and Settings open over it |
| `packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx` (new) | the header, the locked Forge, the footer's order and actions, Resume's markers and Esc, the digits, Controls and Settings, a link to a find, the journal's Quests |
| `packages/client/src/features/delve/hub/AnvilHub.tsx` | the tab plumbing becomes the exported `useHubTabs`, shared with the pause; the Forge's title "Forge at the Anvil" while paused |
| `packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx` | the paused Forge carries its title |
| `packages/client/src/features/delve/hub/loadout/ComparePane.tsx` | the locked note: "Locked during the dive" (`equip-locked`), the lock glyph and how to equip it, on wood |
| `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx` | the note's new text |
| `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx` | paused, the Select prompt reads "Inspect" |
| `packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx` | the paused prompts and note |
| `packages/client/src/features/controls/ControlsPanel.tsx` | "Basic attack: Auto / Manual" (`attack-mode-toggle`), the device preference `delveStore.setManualAttack` keeps |
| `packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx` | the toggle |
| `packages/client/src/features/delve/ItemDetailSheet.tsx` (deleted, Task 5) | retired (decided item 16): the compare pane, the item tooltip and the Forge's bench replaced it |
| `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx` (deleted, Task 5) | its test |

**Ownership.** `PauseScreen.tsx`, `ControlsPanel.tsx` and the deletion are 3D's by the spec. The edits in `AnvilHub.tsx`, `ComparePane.tsx` and `LoadoutTab.tsx` (and their tests) are the hub's, which no other 3b area owns: the spec puts the pause's tabs ("the compare pane's actions become 'Locked during the dive'", the Inspect prompt, the Forge's tooltip) under 3D, and the brief gives 3D the hub for the shared tab plumbing. Neither 3E nor 3F touches them.

## Cross-area needs

No edit in another area's files. For 3E (`DelveRun.tsx`) and the integrator:

1. **Render the pause while `menuOpen`** (3E), inside `.delve-page`, after the HUD and after `StopScreen` (so it opens over the stop):

   ```tsx
   {menuOpen && (
     <PauseScreen
       dive={dive}
       biome={biome}
       foesLeft={arena.hud?.monstersLeft ?? 0}
       link={pauseLink}
       onResume={() => setMenuOpen(false)}
       onAnvil={() => navigate('/delve')}
       onAbandon={() => {
         setMenuOpen(false);
         onCamp();
       }}
     />
   )}
   ```

   `PauseScreen` positions itself: its root is `absolute inset-0 z-40`, over the HUD grid (`z-20`) and the banners (`z-30`). It reads `link` once, when it mounts (each opening mounts it anew), so 3E sets `pauseLink` before `setMenuOpen(true)` and clears it on resume: the Found log's (and the stop's) item click opens `{ tab: 'loadout', uid }` (the old `openItem` also called `markSeen([uid])`; keeping that clears the item's NEW, as the sheet did), the journal (`onJournal`, J / View) `{ tab: 'quests' }`, the purse's Menu nothing.
2. **Remove** (3E) the kebab block (`DelveRun.tsx`'s `{menuOpen && (<div className="delve-panel …" data-pad-scope>…</div>)}`), the `controlsOpen` state and its `<ControlsPanel …/>`, and `ItemDetailSheet` (its import, `sheetUid` and the `{sheetUid && <ItemDetailSheet …/>}` line; `paused` drops `!!sheetUid` and `controlsOpen`). Controls now open from the pause, and the attack toggle lives in them. Task 5 deletes the file once this lands.
3. **Esc, B and Menu need nothing from 3E.** While paused the arena isn't live (`menuOpen` is in `paused`), so the prompt runtime and the pad nav own the keys: Esc presses the pause's `[data-pad-back]` (Resume), B the same, Menu its `[data-pad-menu]` (Resume), and the pad's focus starts on its `[data-pad-first]` (Resume). The purse's "Dive menu" (`data-pad-menu`) opens it while the arena is live, as today.
4. **The stop's Menu (3E):** with no back at the stop, its `data-pad-menu` opens this same `PauseScreen` over the stop (`foesLeft` 0), and Resume returns to it.
5. **3F (optional):** the Controls dialog now carries the attack toggle (`attack-mode-toggle`), so the Training panel's own `training-attack-mode` duplicates it; no id clashes either way.
6. **E2E (integrator):** see "Verification" for the ids this area keeps and changes. Beyond the spec's list, **D09** (`delve.spec.ts`) uses `attack-mode-toggle` as the menu's marker and **G05**'s last check reads it hidden: both switch to `pause-screen`.
7. **Version:** the 0.57.0 bump is the integrator's (the overview's), not this area's.

## Where the spec left room

- **Reuse, not a copy.** `useHubTabs` holds exactly what `AnvilHub` did for its tabs (the tab, the link, the tab's prompts and footer action, the badges, the digits), so both screens step, badge and link the same way. `AnvilHub` keeps its `mode` prop (and its test of the paused Forge's digit); the pause no longer renders it.
- **The pause's `onDelve`** (a `HubTabProps` field the Skills tab's Apply bar uses) is `onResume`: in `mode: 'pause'` no tab calls it (Skills sets no footer action there).
- **Header:** kit `Header`: the title "Paused", the subtitle "Depth N · <biome> · n foes left" ("1 foe left"), the tabs, and the note as a wood-framed box with the lock glyph (`pause-note`), the board's.
- **Footer:** the tab's prompts (on Loadout: Inspect, Full compare), then a display-only "Tabs" prompt whose keycap reads "1 – 5" and whose pad glyph is RB (`Binding.key` is drawn as given when it isn't a key code; nothing binds it, the header's Tabs and the digits do the stepping). Then plank Buttons Controls (`open-controls`) and Settings (`open-settings`) with their glyphs, "Anvil · floor restarts" (`pause-anvil`), the danger "Abandon · lose bounty" (`pause-abandon`, no confirm, as today's kebab) and the primary large Resume (`pause-resume`, Esc / Menu glyph, `data-pad-back`, `data-pad-menu`, `data-pad-first`).
- **"Inspect"** is the Loadout's Select prompt renamed while paused (the board's word); it stays display only.
- **The locked note** is the board's: the lock glyph and "Locked during the dive" (24 px display, hot) on the wood box, then "Equip it at the Anvil between dives, or take Equip as is at the next stop." The board said "Equip it at the Anvil, or …"; the same note shows at the Anvil while a dive is open, so it says "between dives". `equip-locked` sits on the title alone, so the E2E's exact text holds.
- **Controls and Settings** open over the pause as the kit `Dialog`s they are (their Back answers Esc / B and returns the focus to the opener). The pause has no system menu of its own: its footer is the menu.
- **The attack toggle** is one plank `Button` reading "Basic attack: Auto" or "Basic attack: Manual" that flips it (D05 reads its text), at the top of the Controls dialog: it is the same device preference `delveStore.setManualAttack` keeps (`alloy:delve:manualAttack`). It shows wherever Controls opens (the system menu, the pause, Training).
- **Skipped from the board:** the bag pane's foot note ("Found this dive: 3 new, banked when you extract"); the spec doesn't ask for it, and the NEW tags and the tab's count carry it.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `ui/p3b-3d` (five), staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-ui-p3b-3d`.
- **Line endings:** the edited files are CRLF in the working tree (git stores LF; `core.autocrlf` is on): keep them (the Edit tool does; never Git Bash `sed -i`). The new files are written LF. Prettier runs as `npx prettier --write --end-of-line auto`, which keeps each file's endings.
- **Prettier:** every file edited here passes `prettier --check` at the base, and the code below is already formatted (checked on the scratch copy), so each commit block's `--write` changes nothing typed as written.
- **How the edits read:** "Replace: A with: B" is one Edit (old A, new B). "Replace the lines from `A` up to … the end of the file with: C" is one Edit whose old text runs from the start of the line that reads `A` (ignoring its indentation) to the file's last line, and whose new text is C. "Create `f`:" is a Write. Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **Checked on a scratch copy** of `ui/p3b` at `cd13060` (`git archive`, junctioned `node_modules`, the engine built once): every edit below applied cleanly; each task's FAIL was run against the base sources with its new test; with Tasks 1–4 the client suite went from 1146 tests in 145 files to 1154 in 146, the typecheck was clean and `prettier --check` passed on all ten files; with Task 5 (and a stand-in for 3E's removal of the `ItemDetailSheet` lines from `DelveRun.tsx`) it read 1136 in 145, typecheck clean.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: Controls, the locked note, the shared tabs and the pause

### Task 1: "Basic attack: Auto / Manual" in the Controls panel

The kebab's toggle moves into the Controls dialog (decided item 18), its id kept.

**Files:**
- Modify: `packages/client/src/features/controls/ControlsPanel.tsx`
- Modify: `packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx`, replace:

```tsx
import { useControlsStore } from '@/stores/controlsStore';
```

with:

```tsx
import { useControlsStore } from '@/stores/controlsStore';
import { MANUAL_ATTACK_KEY, useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
  it('resets to the default, and copies the setup to send over', async () => {
```

with:

```tsx
  it("switches the basic attack between Auto and Manual, this device's preference", () => {
    useDelveStore.getState().setManualAttack(false);
    render(<ControlsPanel onClose={() => {}} />);
    const toggle = screen.getByTestId('attack-mode-toggle');
    expect(toggle).toHaveTextContent('Basic attack: Auto');
    fireEvent.click(toggle);
    expect(useDelveStore.getState().manualAttack).toBe(true);
    expect(localStorage.getItem(MANUAL_ATTACK_KEY)).toBe('1');
    expect(toggle).toHaveTextContent('Basic attack: Manual');
    fireEvent.click(toggle);
    expect(useDelveStore.getState().manualAttack).toBe(false);
  });

  it('resets to the default, and copies the setup to send over', async () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/controls/__tests__/ControlsPanel.test.tsx)`
Expected: FAIL, 1 failed: `TestingLibraryElementError: Unable to find an element by: [data-testid="attack-mode-toggle"]`.

- [ ] **Step 3: The toggle**

In `packages/client/src/features/controls/ControlsPanel.tsx`, replace:

```tsx
import { useControlsStore } from '@/stores/controlsStore';
```

with:

```tsx
import { useControlsStore } from '@/stores/controlsStore';
import { useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
  const cfg = useControlsStore((s) => s.config);
```

with:

```tsx
  const cfg = useControlsStore((s) => s.config);
  const manual = useDelveStore((s) => s.manualAttack);
```

Replace:

```tsx
          already uses it, the two swap. Changes apply at once.
        </p>
```

with:

```tsx
          already uses it, the two swap. Changes apply at once.
        </p>

        <Button
          className="self-start"
          onClick={() => useDelveStore.getState().setManualAttack(!manual)}
          testId="attack-mode-toggle"
        >
          Basic attack: {manual ? 'Manual' : 'Auto'}
        </Button>
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/controls/__tests__/ControlsPanel.test.tsx)`
Expected: PASS (7 tests).
Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: N + 1 tests in F files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3b-3d
(cd packages/client && npx prettier --write --end-of-line auto src/features/controls/ControlsPanel.tsx src/features/controls/__tests__/ControlsPanel.test.tsx)
git add packages/client/src/features/controls/ControlsPanel.tsx packages/client/src/features/controls/__tests__/ControlsPanel.test.tsx
git commit -m "feat(client): the basic attack's Auto / Manual moves into the Controls panel" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: "Locked during the dive", and Inspect while paused

The compare pane's locked note becomes the board's; paused, the Loadout's Select prompt reads Inspect.

**Files:**
- Modify: `packages/client/src/features/delve/hub/loadout/ComparePane.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx`
- Modify: `packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('equip-locked')).toHaveTextContent(
      'Equip at the Anvil, between dives',
    );
```

with:

```tsx
    expect(screen.getByTestId('equip-locked')).toHaveTextContent(/^Locked during the dive$/);
```

In `packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx`, replace:

```tsx
    open({ mode: 'pause', link: { tab: 'loadout', uid: 'h1' } });
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    expect(screen.getByTestId('equip-locked')).toBeInTheDocument();
```

with:

```tsx
    const { props } = open({ mode: 'pause', link: { tab: 'loadout', uid: 'h1' } });
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    expect(screen.getByTestId('equip-locked')).toHaveTextContent('Locked during the dive');
    expect(prompts(props).map((p) => p.label)).toEqual(['Inspect', 'Full compare']);
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx)`
Expected: FAIL, 2 failed ("locked, Equip, Salvage, Lock, the bind choice, Transfer and Forge it give way to a note" and "paused, dive finds carry NEW and their actions are notes"), each `Expected element to have text content: Locked during the dive · Received: Equip at the Anvil, between dives`.

- [ ] **Step 3: The note and the prompt**

In `packages/client/src/features/delve/hub/loadout/ComparePane.tsx`, replace:

```tsx
          <p className="k-well p-3 text-[16px] text-[var(--k-hot)]" data-testid="equip-locked">
            Equip at the Anvil, between dives
          </p>
```

with:

```tsx
          <div className="flex flex-col gap-2.5 border-[3px] border-[var(--k-wood-1)] bg-[var(--k-wood-0)] p-4">
            <span className="flex items-center gap-3">
              <Glyph id="lock" size={24} />
              <span className="k-disp text-[24px] text-[var(--k-hot)]" data-testid="equip-locked">
                Locked during the dive
              </span>
            </span>
            <span className="text-[16px] text-[var(--k-wood-text)]">
              Equip it at the Anvil between dives, or take Equip as is at the next stop.
            </span>
          </div>
```

(`Glyph` is already imported there.) In `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx`, replace:

```tsx
      { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
```

with:

```tsx
      {
        id: 'select',
        label: mode === 'pause' ? 'Inspect' : 'Select',
        binding: { mouse: 'click', pad: 'a' },
      },
```

(`mode` is already in that effect's dependencies.)

- [ ] **Step 4: Run them to see them pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx)`
Expected: PASS (17 and 11 tests).
Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: N + 1 tests in F files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3b-3d
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/loadout/ComparePane.tsx src/features/delve/hub/loadout/LoadoutTab.tsx src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx)
git add packages/client/src/features/delve/hub/loadout/ComparePane.tsx packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx
git commit -m "feat(client): the compare pane's lock reads \"Locked during the dive\", and the paused Loadout's Select is Inspect" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: `useHubTabs`, the hub's tabs for the Anvil and the pause

`AnvilHub`'s tab plumbing becomes an exported hook (no change in the Anvil's behaviour), and the paused Forge gets its tooltip.

**Files:**
- Modify: `packages/client/src/features/delve/hub/AnvilHub.tsx`
- Modify: `packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('tab-forge')).toBeDisabled();
    press('Digit3');
```

with:

```tsx
    expect(screen.getByTestId('tab-forge')).toBeDisabled();
    expect(screen.getByTestId('tab-forge')).toHaveAttribute('title', 'Forge at the Anvil');
    press('Digit3');
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/AnvilHub.test.tsx)`
Expected: FAIL, 1 failed ("a disabled tab's digit does nothing: the pause hub's Forge"): `Expected the element to have attribute: title="Forge at the Anvil"`, received none.

- [ ] **Step 3: The hook**

In `packages/client/src/features/delve/hub/AnvilHub.tsx`, replace the lines from `/**` up to the end of the file with:

```tsx
/**
 * The hub's tabs, shared by the Anvil and the pause: the open tab and the link it carries
 * (`initial` at first), the tab's prompts and footer action, the header's Tabs (`nav`), the
 * open tab's view (`view`) and the digit keys (`digits`, for the screen's usePrompts). In
 * `mode: 'pause'` the Forge is disabled ("Forge at the Anvil"): LB/RB and the digits skip it.
 */
export function useHubTabs(mode: HubMode, onDelve: () => void, initial?: HubLink) {
  const newCount = useDelveStore((s) => Object.keys(s.newUids).length);
  const unapplied = Object.keys(useDelveStore(selectDraftApply).changes).length;
  const [tab, setTab] = useState<HubTab>(initial?.tab ?? 'loadout');
  // The link the last go() carried, for the tab it names; a plain tab change carries none.
  const [link, setLink] = useState<HubLink | undefined>(initial);
  const [tabPrompts, setTabPrompts] = useState<Prompt[]>([]);
  const [footerAction, setFooterAction] = useState<ReactNode>(null);
  const tabs = TABS.map((t) => {
    const locked = mode === 'pause' && t.id === 'forge';
    return { ...t, disabled: locked, title: locked ? 'Forge at the Anvil' : undefined };
  });

  const open = (to: HubTab, carried?: HubLink) => {
    if (to !== tab) setTabPrompts([]);
    setTab(to);
    setLink(carried);
    playSound('buttonClick');
  };
  const go = (to: HubLink) => open(to.tab, to);
  const digits: Prompt[] = tabs.map((t, i) => ({
    id: `tab-${t.id}`,
    label: t.label,
    binding: { key: [`Digit${i + 1}`, `Numpad${i + 1}`] },
    onPress: () => open(t.id),
    disabled: t.disabled,
  }));
  const View = TAB_VIEWS[tab];

  const nav = (
    <Tabs
      aria-label="The Anvil"
      level="top"
      digits
      glyphs
      value={tab}
      onChange={(t) => open(t)}
      tabs={tabs.map((t) => ({
        ...t,
        testId: `tab-${t.id}`,
        badge:
          t.id === 'loadout' && newCount > 0 ? (
            <span aria-label={`${newCount} new`}>{newCount}</span>
          ) : t.id === 'skills' && unapplied > 0 ? (
            <span
              aria-label={`${unapplied} unapplied change${unapplied === 1 ? '' : 's'}`}
              data-testid="draft-count"
            >
              {unapplied}
            </span>
          ) : undefined,
      }))}
    />
  );
  const view = (
    <View
      key={tab}
      mode={mode}
      setPrompts={setTabPrompts}
      setFooterAction={setFooterAction}
      go={go}
      link={link?.tab === tab ? link : undefined}
      onDelve={onDelve}
    />
  );
  return { nav, view, tabPrompts, footerAction, digits };
}

/**
 * The Anvil hub: a kit Screen with the steel header (tabs 1–5 or LB/RB), the
 * wood footer (the tab's prompts and Menu, then Training, the start depths and
 * Delve, or the tab's own footer action) and the system menu on Esc / B. Each
 * tab draws its own grid of panes in the main.
 */
export function AnvilHub({ mode }: { mode: HubMode }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  // The start depth the footer's chips pick (the deepest at first), for every Delve button.
  const profile = useDelveStore((s) => s.profile);
  const starts = startDepthOptions(getDelveRegistry(), profile);
  const [start, setStart] = useState(starts[starts.length - 1]);
  const depth = starts.includes(start) ? start : 1;

  const onTraining = () => navigate('/delve/training');
  const onDelve = () => {
    const s = useDelveStore.getState();
    if (!isDiveActive(s.profile) && !s.startDive(depth)) return;
    playSound('phaseTransition');
    vibrate('medium');
    navigate('/delve/run');
  };
  const hub = useHubTabs(mode, onDelve);

  // The footer's prompts: the tab's, then the hub's Menu. The hub also binds Training (its
  // button draws the glyph) and the digits.
  const prompts: Prompt[] = [
    ...hub.tabPrompts,
    {
      id: 'menu',
      label: 'Menu',
      binding: { key: 'Escape', pad: 'b' },
      onPress: () => setMenuOpen(true),
      asButton: true,
      padBack: true,
    },
  ];
  usePrompts(
    [
      ...prompts,
      { id: 'training', label: 'Training', binding: TRAINING_BINDING, onPress: onTraining },
      ...hub.digits,
    ],
    mainRef,
  );

  return (
    <>
      <Screen
        backdrop="wall"
        headerStyle="band"
        testId={`hub-${mode}`}
        header={<HubHeader nav={hub.nav} />}
        footer={
          <HubFooter
            prompts={prompts}
            onTraining={onTraining}
            start={depth}
            onStart={setStart}
            onDelve={onDelve}
            action={hub.footerAction}
          />
        }
      >
        <div ref={mainRef} className="h-full min-h-0">
          {hub.view}
        </div>
      </Screen>
      {menuOpen && <SystemMenu onClose={() => setMenuOpen(false)} />}
    </>
  );
}
```

The imports at the top of the file are unchanged (`Tabs`, `selectDraftApply` and the rest are still used, now by the hook).

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/AnvilHub.test.tsx)`
Expected: PASS (11 tests).
Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: N + 1 tests in F files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3b-3d
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/AnvilHub.tsx src/features/delve/hub/__tests__/AnvilHub.test.tsx)
git add packages/client/src/features/delve/hub/AnvilHub.tsx packages/client/src/features/delve/hub/__tests__/AnvilHub.test.tsx
git commit -m "refactor(client): the hub's tabs as useHubTabs, for the Anvil and the pause; the paused Forge says \"Forge at the Anvil\"" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: `PauseScreen`

The pause board: the hub's tabs, read-only, between the pause's band and planks.

**Files:**
- Create: `packages/client/src/features/delve/hub/PauseScreen.tsx`
- Create: `packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../registry';
import { PauseScreen } from '../PauseScreen';
import type { HubLink } from '../types';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

const renderPause = (link?: HubLink) => {
  const on = { onResume: vi.fn(), onAnvil: vi.fn(), onAbandon: vi.fn() };
  const dive = store().profile.dive!;
  render(
    <PauseScreen
      dive={dive}
      biome={registry.getBiomeForDepth(dive.depth)}
      foesLeft={12}
      link={link}
      {...on}
    />,
  );
  return on;
};
const selected = () =>
  within(screen.getByRole('tablist', { name: 'The Anvil' }))
    .getAllByRole('tab')
    .filter((t) => t.getAttribute('aria-selected') === 'true')
    .map((t) => t.getAttribute('data-testid'));
/** A key press as the window hears it, with every element given a box (jsdom lays nothing out). */
const press = (code: string) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    fireEvent.keyDown(document.body, { code });
  } finally {
    box.mockRestore();
  }
};

describe('PauseScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    // The app makes the UI layer after the root; a layer left by an earlier test would sit before it.
    document.getElementById('delve-ui-layer')?.remove();
    store().resetProfile(1234, 'fire');
    store().startDive(1);
  });

  it('is a pad scope: Paused, the floor, the tabs with the Forge locked, and the gear note', () => {
    renderPause();
    const pause = screen.getByTestId('pause-screen');
    expect(pause).toHaveAttribute('data-pad-scope');
    const header = pause.querySelector('header')!;
    expect(header).toHaveTextContent('Paused');
    expect(header).toHaveTextContent(
      `Depth 1 · ${registry.getBiomeForDepth(1).name} · 12 foes left`,
    );
    expect(selected()).toEqual(['tab-loadout']);
    const forge = screen.getByTestId('tab-forge');
    expect(forge).toBeDisabled();
    expect(forge).toHaveAttribute('title', 'Forge at the Anvil');
    expect(screen.getByTestId('pause-note')).toHaveTextContent(
      'Gear is locked until you are back at the Anvil',
    );
  });

  it('the footer: Inspect, Full compare and Tabs, then Controls, Settings, Anvil, Abandon and Resume', () => {
    const on = renderPause();
    const footer = screen.getByTestId('pause-screen').querySelector('footer')!;
    const text = footer.textContent!;
    const order = [
      'Inspect',
      'Full compare',
      'Tabs',
      'Controls',
      'Settings',
      'Anvil · floor restarts',
      'Abandon · lose bounty',
      'Resume',
    ].map((s) => text.indexOf(s));
    expect(order.every((at, i) => at > (order[i - 1] ?? -1))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Anvil · floor restarts' }));
    expect(on.onAnvil).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Abandon · lose bounty' }));
    expect(on.onAbandon).toHaveBeenCalledTimes(1);
    expect(on.onResume).not.toHaveBeenCalled();
  });

  it('Resume is hot metal on Esc / B / Menu and the first focus; Esc resumes', () => {
    const on = renderPause();
    const resume = screen.getByTestId('pause-resume');
    for (const marker of ['data-pad-back', 'data-pad-menu', 'data-pad-first'])
      expect(resume).toHaveAttribute(marker);
    expect(resume).toHaveClass('k-btn-lg');
    press('Escape');
    expect(on.onResume).toHaveBeenCalledTimes(1);
  });

  it('the digits skip the locked Forge', () => {
    renderPause();
    press('Digit3');
    expect(selected()).toEqual(['tab-loadout']);
    press('Digit4');
    expect(selected()).toEqual(['tab-codex']);
  });

  it('Controls and Settings open over the pause, and Esc closes only them', () => {
    const on = renderPause();
    fireEvent.click(screen.getByTestId('open-controls'));
    expect(screen.getByTestId('attack-mode-toggle')).toHaveTextContent('Basic attack: Auto');
    press('Escape');
    expect(screen.queryByTestId('controls-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('open-settings'));
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    press('Escape');
    expect(screen.queryByTestId('settings-panel')).toBeNull();
    expect(on.onResume).not.toHaveBeenCalled();
  });

  it("a link opens on its item: the Found log's find, NEW, its actions locked", () => {
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' },
      new SeededRNG(4),
    );
    store().setProfile({ ...store().profile, bag: [helm] });
    store().markNew(['h1']);
    renderPause({ tab: 'loadout', uid: 'h1' });
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    expect(screen.getByTestId('equip-locked')).toHaveTextContent('Locked during the dive');
    expect(screen.queryByTestId('equip-button')).toBeNull();
    expect(screen.getByRole('tab', { name: /Loadout/ })).toHaveTextContent('1');
  });

  it('opens on Quests from the journal', () => {
    renderPause({ tab: 'quests' });
    expect(selected()).toEqual(['tab-quests']);
    expect(screen.getByTestId('quests-empty')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/PauseScreen.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../PauseScreen" from "src/features/delve/hub/__tests__/PauseScreen.test.tsx". Does the file exist?`

- [ ] **Step 3: The screen**

Create `packages/client/src/features/delve/hub/PauseScreen.tsx`:

```tsx
import { useRef, useState } from 'react';
import type { BiomeDef, DiveState } from '@alloy/engine';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { Button, Footer, Glyph, Header, Screen, usePrompts, type Prompt } from '../kit';
import { useHubTabs } from './AnvilHub';
import { SettingsPanel } from './SettingsPanel';
import type { HubLink } from './types';

// hub/PauseScreen.tsx (3D) — 3E renders it from DelveRun while menuOpen
export interface PauseScreenProps {
  dive: DiveState;
  biome: BiomeDef;
  foesLeft: number;
  link?: HubLink; // the Found log's item, or { tab: 'quests' } from the journal
  onResume: () => void;
  onAnvil: () => void; // floor restarts
  onAbandon: () => void; // lose bounty
}

/** The footer's Tabs prompt, drawn only: the header's Tabs and the digit keys do the stepping. */
const TABS_PROMPT: Prompt = { id: 'tabs', label: 'Tabs', binding: { key: '1 – 5', pad: 'rb' } };

/**
 * The pause (Esc / Menu mid-dive): the hub's tabs, read-only, over the dimmed arena. The steel
 * band names the floor, the tabs (the Forge locked) and the gear lock; the planks hold the tab's
 * prompts and Tabs, then Controls, Settings, Anvil, Abandon and Resume, which Esc, B and Menu
 * press and the pad focuses first.
 */
export function PauseScreen({
  dive,
  biome,
  foesLeft,
  link,
  onResume,
  onAnvil,
  onAbandon,
}: PauseScreenProps) {
  const [dialog, setDialog] = useState<'controls' | 'settings' | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const hub = useHubTabs('pause', onResume, link);
  const prompts = [...hub.tabPrompts, TABS_PROMPT];
  usePrompts([...prompts, ...hub.digits], mainRef);

  return (
    // Over the HUD (z-20) and the banners (z-30).
    <div className="absolute inset-0 z-40">
      <Screen
        backdrop="arena-pause"
        headerStyle="band"
        testId="pause-screen"
        header={
          <Header
            title="Paused"
            subtitle={`Depth ${dive.depth} · ${biome.name} · ${foesLeft} ${foesLeft === 1 ? 'foe' : 'foes'} left`}
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
            <Button onClick={() => setDialog('controls')} testId="open-controls">
              <Glyph id="controls" size={20} /> Controls
            </Button>
            <Button onClick={() => setDialog('settings')} testId="open-settings">
              <Glyph id="settings" size={20} /> Settings
            </Button>
            <Button onClick={onAnvil} testId="pause-anvil">
              Anvil · floor restarts
            </Button>
            <Button variant="danger" onClick={onAbandon} testId="pause-abandon">
              Abandon · lose bounty
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={onResume}
              binding={{ key: 'Escape', pad: 'menu' }}
              data-pad-back
              data-pad-menu
              data-pad-first
              testId="pause-resume"
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
      {dialog === 'controls' && <ControlsPanel onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsPanel onClose={() => setDialog(null)} />}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/PauseScreen.test.tsx)`
Expected: PASS (7 tests).
Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: N + 8 tests in F + 1 files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p3b-3d
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/PauseScreen.tsx src/features/delve/hub/__tests__/PauseScreen.test.tsx)
git add packages/client/src/features/delve/hub/PauseScreen.tsx packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx
git commit -m "feat(client): the pause: the hub's tabs read-only over the arena, Resume on Esc / B / Menu" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: Delete `ItemDetailSheet` (after 3E's `DelveRun`)

Decided item 16: the compare pane, the item tooltip and the Forge's bench replaced the sheet, and the pause replaces its last use. **Gate:** 3E's `DelveRun.tsx` (Cross-area need 2) must be in this branch first.

**Files:**
- Delete: `packages/client/src/features/delve/ItemDetailSheet.tsx`
- Delete: `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`

- [ ] **Step 1: Check the gate**

Run: `grep -rln ItemDetailSheet packages/client/src`
Expected: exactly the two files above. If `packages/client/src/pages/DelveRun.tsx` is listed too, 3E's change isn't here yet: stop, and run this task after it merges (or hand it to the integrator on `ui/p3b`).

- [ ] **Step 2: Delete them**

```bash
cd /c/Projects/alloy-ui-p3b-3d
git rm packages/client/src/features/delve/ItemDetailSheet.tsx packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx
```

- [ ] **Step 3: The whole client**

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: the suite passes with 18 tests and 1 file fewer than before this task; the typecheck prints nothing (the `items/*` views it used stay, for the compare pane, the tooltip and the bench).

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/alloy-ui-p3b-3d
git commit -m "refactor(client): delete ItemDetailSheet: the compare pane, the item tooltip, the Forge's bench and the pause replace it" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Verification (the area's end check)

- Client: `npx tsc --noEmit -p .` clean and `npx vitest run` at **N + 8 tests in F + 1 files** after Task 4, **N − 10 in F** after Task 5 (1136 in 145 from `cd13060`).
- Engine: untouched (`git diff ui/p3b -- packages/engine` is empty).
- `git diff --stat ui/p3b` lists only the files in "Files".
- **E2E ids** (for the integrator's updates; the pause is 3E's to mount):
  - **Kept, same behaviour:** `open-controls` (now the pause's footer), `attack-mode-toggle` (now inside the Controls dialog, `controls-panel`; text "Basic attack: Auto" / "Basic attack: Manual"), `equip-locked` (its text is now exactly "Locked during the dive"), `item-sheet`, `item-name`, `item-compare`, `tab-<id>` (the pause's tabs carry the hub's ids; `tab-forge` disabled with the title "Forge at the Anvil"), `bind-pad-<action>`, `controls-panel`.
  - **New:** `pause-screen` (the root, a `data-pad-scope`), `pause-resume` (Resume: `data-pad-back`, `data-pad-menu`, `data-pad-first`), `pause-anvil` ("Anvil · floor restarts"), `pause-abandon` (role name "Abandon · lose bounty"), `open-settings`, `pause-note`.
  - **Gone:** the kebab's buttons ("Back to the Anvil (floor restarts)", "Abandon dive (lose bounty)", its Resume), `ItemDetailSheet`'s Close.
  - **Per spec:** D01 opens the pause ("Dive menu" or Esc → `pause-screen`) and returns (`pause-resume`); D02's `loot-item` click opens the pause on Loadout with the item (`item-sheet`, `equip-locked` "Locked during the dive", no `equip-button`), and leaves with `getByRole('button', { name: 'Abandon · lose bounty' })`; D05 opens `open-controls` from the pause before the toggle (and Esc twice to come back); G01: Menu → `pause-resume` focused, RB → `tab-skills`, RB → `tab-codex` (Forge skipped), B → `pause-screen` hidden, Menu → shown with `pause-resume` focused, A → hidden; G05: Menu → `open-controls` → rebind → B closes the editor → B resumes (`pause-screen` hidden). D09 swaps `attack-mode-toggle` for `pause-screen` as its marker.
- **A manual look** once 3E mounts it (dev server, a dive at 1920×1080 and 1280×720): Esc opens the pause over the dimmed arena with the HUD under it; the band reads "Paused · Depth 1 · <biome> · n foes left", the tabs (Forge greyed, its tooltip on hover) and the wood note; 1–5 skip the Forge; on Loadout the dive's finds carry NEW and the compare pane's foot reads "Locked during the dive"; Controls and Settings open over it and Esc closes only them; Esc, then the pad's B and Menu, resume; with the pad, the focus starts on Resume.
