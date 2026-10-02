# Delve UI v1 · Phase 2 · 2A: Loadout — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Anvil's Loadout tab as its three panes in the forge kit: `EquippedPane` (the paper doll round the hero on the anvil, the stats, the pair's attunement, the weapon's moveset), `BagPane` (count, filter and sort chips, eight columns of ▲ ▼ ◇ tiles, Equip best, Salvage junk, auto-salvage "up to") and `ComparePane` (the hovered, selected or worn item against what's worn: Power, the stat table, the attunement it moves, the bind choice inline, a weapon's moveset Transfer, Equip / Salvage / Lock with their gains, "Forge it ›"), composed by `LoadoutTab(props: HubTabProps)`. `ItemTile` becomes a kit `Tile`; `BindPrompt`, `BagPanel` and `PaperDoll` go. The kit tooltip, whose first user is the equipped tiles' `ItemTooltip`, learns to measure, flip and clamp its card and to follow a scroll or resize (carried from the Phase 1 review). The compare table splits value from label and, with `PowerDelta`, takes the kit's sizes and colours.

**Architecture:** `hub/loadout/LoadoutTab.tsx` owns the tab's state (the hovered and selected item, Full compare, the armed Salvage, the bind ask), its item actions (`equip`, `salvage`, `lock`) and its prompts, set once through `setPrompts` and acting through a ref on the latest target. The three panes are presentational over the store: `EquippedPane` and `BagPane` take callbacks; `ComparePane` takes the item, its source and the actions, and does Transfer and Unequip itself; `BindChoice` (inline, `bind-prompt*`) binds and equips on its own, as `BindPrompt` did. Every rule stays the engine's (`compareItem`, `salvageCandidates`, `equipBest`, `movesetTransfer`, `weaponParts`, `bindSecondary`, `profileStats`, `estimateCombat`, `manaPool`). No engine change, no store change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md`: "Phase 2: The Anvil hub" → the shared contract and **2A · Loadout**, decided items 16, 24, 30, 33 and 36, "The input map" (Loadout's rows), "Accessibility" (the Upgrades chip's ▲ in a well). The overview is `00-overview.md` in this folder (its "Carried from the Phase 1 review": the tooltip placement, `CompareTable`'s label split). Mockup: `Anvil-Loadout.dc.html`.

---

## Base

- **Starts from:** `ui/p2` at `807b324` (step 2·0, `3f8ef0e..2d6273a`, plus the Phase 1 review fixes merged in). 2A runs in its own worktree, `C:/Projects/alloy-ui-2a` on branch `ui/p2-2a` (the overview's worktree rules: PowerShell `cmd /c mklink /J` junctions, the client's `@alloy/engine` pointing at the worktree's own `packages/engine`). Every path below is relative to that worktree's root, `/c/Projects/alloy-ui-2a` in Git Bash.
- **What 2A needs from 2·0:** `hub/types.ts` (`HubTabProps`, `HubLink`, `HubMode`), `items/AttunementBars.tsx` (`AttunementBars({ stats, elements })`). Both are on `ui/p2`.
- **Before Task 1:** build the engine once for the junction and measure the client:

```bash
cd /c/Projects/alloy-ui-2a
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; at `807b324` the suite reads **1004 tests in 123 files**. Call the measured counts **N tests in F files** (N = 1004, F = 123 at `807b324`). Tasks 1–8 end at **N + 34 tests in F + 4 files**; Task 9 (at integration) changes no count.
- **Task 9 runs at integration**, on `ui/p2` after 2·I wires `LoadoutTab` into `AnvilHub` (Cross-area need X1): `BagPanel.tsx` and `PaperDoll.tsx` are imported only by `AnvilHub.tsx`, which 2A does not edit.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/ItemTile.tsx` | **Overwritten:** an item as a kit `Tile` (rarity, ▲ ▼ ◇, NEW, lock, equipped, the mana pip); `deltaMark(delta, asIs)`; the same props plus `asIs` and every button attribute (a tooltip's handlers, `onContextMenu`, `className`) |
| `packages/client/src/features/delve/__tests__/ItemTile.test.tsx` | **Overwritten:** the kit tile's marks and names, ◇, the forwarded ref, the pip |
| `packages/client/src/features/delve/kit/Tooltip.tsx` | the card measured after it opens (a layout effect), flipped to the other side or clamped at the viewport's edge, placed again on any scroll (capture) and on resize |
| `packages/client/src/features/delve/kit/__tests__/Tooltip.test.tsx` | the flip, the clamp, the scroll and the resize; the `top` case no longer reads a transform |
| `packages/client/src/features/delve/format.ts` | `formatStatValue` ("+12%"); `formatStat` composes it with the label |
| `packages/client/src/features/delve/items/CompareTable.tsx` | `formatStatValue` for the value (no label slicing); 16 px rows, kit label head, gain `#63c74d` / loss `#f6757a` |
| `packages/client/src/features/delve/items/PowerDelta.tsx` | kit label (14 px) and 22 px display values in the gain / loss colours |
| `packages/client/src/features/delve/items/__tests__/CompareTable.test.tsx`, `comparison.test.tsx` | the new colours |
| `packages/client/src/features/delve/hub/loadout/EquippedPane.tsx` (new) | `paper-doll`: the doll (`slot-<slot>`, `ItemTooltip` on worn tiles), `loadout-stats`, `mana-strip`, `loadout-moveset` |
| `packages/client/src/features/delve/hub/loadout/BagPane.tsx` (new) | `bag-panel`: `bag-count`, `bag-filter-<f>`, `bag-sort`, the grid (`bag-item`), `equip-best`, `salvage-junk`, `auto-salvage` |
| `packages/client/src/features/delve/hub/loadout/BindChoice.tsx` (new) | `needsBind`, and the inline bind choice (`bind-prompt`, `-bound`, `-unbound`, `-confirm`, `-not-now`) |
| `packages/client/src/features/delve/hub/loadout/ComparePane.tsx` (new) | `item-sheet`: the compare, Transfer, Unequip, the actions, `forge-it`, the locked note; `LoadoutActions` |
| `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx` (new) | `LoadoutTab(props: HubTabProps)`: the grid, the selection model, the item actions, the prompts, the how-to on a first save |
| `packages/client/src/features/delve/hub/loadout/__tests__/{EquippedPane,BagPane,ComparePane,LoadoutTab}.test.tsx` (new) | each pane's tests; the bind and bag tests moved here from `ItemDetailSheet.test.tsx` |
| `packages/client/src/features/delve/ItemDetailSheet.tsx` | Equip equips as it is: `BindPrompt` and its state go (the sheet is the dive's only, where Equip is locked) |
| `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx` | its five bind tests give way to one (Equip doesn't ask), and its two `BagPanel` tests go (both moved to the panes) |
| `packages/client/src/features/delve/BindPrompt.tsx` | **Deleted** (Task 8) |
| `packages/client/src/features/delve/BagPanel.tsx`, `PaperDoll.tsx` | **Deleted** (Task 9, at integration) |

Outside the Owns column, and why: `ItemDetailSheet.tsx` and its test (deleting `BindPrompt` forces the sheet's edit; no Phase 2 area owns the sheet, which 3b deletes), `kit/Tooltip.tsx` (assigned to 2A by the coordinator for Phase 2), `format.ts`, `items/CompareTable.tsx` and `items/PowerDelta.tsx` (the compare pane's own views; the coordinator's `CompareTable` fix; no other Phase 2 area edits them). `AnvilHub.tsx` is not edited (X1).

## Cross-area needs

**X1 · Integrator (`hub/AnvilHub.tsx`).** What `LoadoutTab` needs from the hub:
1. Render `<LoadoutTab mode setPrompts setFooterAction go link />` straight in the screen's main, not in the interim 960 px column: no zoom undo, no padding, no scroll. The tab draws its own grid (24 px padding top and bottom, 32 px at the sides, a 24 px gap, `430px minmax(0, 1fr) 470px`, one `minmax(0, 1fr)` row) and its panes scroll inside themselves.
2. `setPrompts` stable across renders (a `useState` setter): the tab sets its prompts in an effect keyed on it, and clears them (`[]`) on unmount. The footer draws the tab's prompts before the hub's Menu, and the hub passes them to `usePrompts` in the main's scope. On Loadout the tab's Select replaces the hub's own.
3. `go(link)` sets the tab and hands `link` to the tab it names: Loadout calls `go({ tab: 'skills', view: 'mana' })` (the `mana-strip`), `go({ tab: 'skills' })` (the moveset box) and `go({ tab: 'forge', uid })` ("Forge it ›"), and selects `link.uid` when given `{ tab: 'loadout', uid }`.
4. Loadout sets no footer action (Training, the start depths and Delve stay) and opens no `ItemDetailSheet`.
5. The interim Loadout block goes (how-to, `PaperDoll`, the interim `mana-strip`, `BagPanel`) with the imports and the `attunement` memo only it used (`useMemo`, `MANA_TYPES`, `profileStats`, `Glyph`, `getDelveRegistry`, `manaStyle`, `HowTo`, `PaperDoll`, `BagPanel`).

A reference wiring, checked on a scratch copy of `807b324` with Tasks 1–8 applied (`AnvilHub.test.tsx` passes unchanged, the client suite and typecheck are green, and every Delve E2E on `desktop` passes once D02 is updated as below). The integrator's own wiring supersedes it:

```diff
--- a/packages/client/src/features/delve/hub/AnvilHub.tsx
+++ b/packages/client/src/features/delve/hub/AnvilHub.tsx
@@ -1,22 +1,18 @@
-import { useMemo, useRef, useState } from 'react';
+import { useRef, useState } from 'react';
 import { useNavigate } from 'react-router';
-import { MANA_TYPES, profileStats } from '@alloy/engine';
 import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
 import { playSound } from '@/shared/utils/sound-manager';
-import { Glyph, Panel, Screen, Tabs, usePrompts, type Prompt } from '@/features/delve/kit';
-import { getDelveRegistry } from '../registry';
-import { PaperDoll } from '../PaperDoll';
-import { BagPanel } from '../BagPanel';
+import { Panel, Screen, Tabs, usePrompts, type Prompt } from '@/features/delve/kit';
 import { ForgePanel } from '../ForgePanel';
 import { CodexPanel } from '../CodexPanel';
 import { AbilitiesPanel } from '../AbilitiesPanel';
 import { ItemDetailSheet } from '../ItemDetailSheet';
-import { RARITY_LABEL, RARITY_TEXT, formatNumber, manaStyle } from '../format';
+import { RARITY_LABEL, RARITY_TEXT, formatNumber } from '../format';
 import { HubHeader } from './HubHeader';
 import { HubFooter, TRAINING_BINDING } from './HubFooter';
-import { HowTo } from './HowTo';
 import { ReactionsGrid } from './codex/ReactionsGrid';
 import { SystemMenu } from './SystemMenu';
-import type { HubMode, HubTab } from './types';
+import { LoadoutTab } from './loadout/LoadoutTab';
+import type { HubLink, HubMode, HubTab } from './types';
 
 const TABS: { id: HubTab; label: string }[] = [
@@ -42,4 +38,6 @@ export function AnvilHub({ mode }: { mode: HubMode }) {
   const [selected, setSelected] = useState<string | null>(null);
   const [menuOpen, setMenuOpen] = useState(false);
+  const [tabPrompts, setTabPrompts] = useState<Prompt[]>([]);
+  const [link, setLink] = useState<HubLink | undefined>();
   const mainRef = useRef<HTMLDivElement>(null);
   // Paused mid-dive, the Forge is locked (spec: "Forge at the Anvil").
@@ -55,9 +53,14 @@ export function AnvilHub({ mode }: { mode: HubMode }) {
     setSelected(uid);
   };
+  const follow = (to: HubLink) => {
+    setLink(to);
+    go(to.tab);
+  };
   const onTraining = () => navigate('/delve/training');
 
   // The footer's prompts; the hub also binds Training (its button draws the glyph) and the digits.
+  const select: Prompt = { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } };
   const prompts: Prompt[] = [
-    { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
+    ...(tab === 'loadout' ? tabPrompts : [select]),
     {
       id: 'menu',
@@ -84,10 +87,4 @@ export function AnvilHub({ mode }: { mode: HubMode }) {
   );
 
-  const { equipped, pair } = profile;
-  const attunement = useMemo(
-    () => profileStats(getDelveRegistry(), { equipped, pair }).attunement,
-    [equipped, pair],
-  );
-
   return (
     <>
@@ -127,49 +124,38 @@ export function AnvilHub({ mode }: { mode: HubMode }) {
         footer={<HubFooter prompts={prompts} onTraining={onTraining} />}
       >
-        <div ref={mainRef} className="h-full overflow-y-auto px-8 py-6">
-          {/* Today's panels until Phase 2's panes, at their own size: the column undoes the UI zoom. */}
-          <div className="mx-auto flex w-[960px] max-w-full flex-col gap-4 [zoom:calc(1/var(--ui-scale,1))]">
-            {tab === 'loadout' && (
-              <>
-                {profile.stats.dives === 0 && <HowTo />}
-                <PaperDoll onSelect={openItem} />
-                <button
-                  type="button"
-                  className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[14px]"
-                  onClick={() => go('skills')}
-                  data-testid="mana-strip"
-                >
-                  {MANA_TYPES.filter((m) => attunement[m] > 0).map((m) => {
-                    const style = manaStyle(getDelveRegistry(), m);
-                    return (
-                      <span key={m} className="flex items-center gap-1" title={style.name}>
-                        <Glyph id={m} size={16} color={style.color} /> {attunement[m]}
-                      </span>
-                    );
-                  })}
-                  <span className="text-[var(--k-text-2)]">· Skills ›</span>
-                </button>
-                <BagPanel onSelect={openItem} />
-              </>
-            )}
-            {tab === 'skills' && <AbilitiesPanel />}
-            {tab === 'forge' && <ForgePanel onSelect={openItem} />}
-            {tab === 'codex' && (
-              <>
-                <CodexPanel />
-                {/* Out of the chain builder; 2C's Codex panes take it in. */}
-                <ReactionsGrid reactionsSeen={profile.reactionsSeen} />
-                {profile.stats.dives > 0 && <Records />}
-              </>
-            )}
-            {tab === 'quests' && (
-              <Panel title="Quests" testId="quests-empty" scroll={false}>
-                <p className="text-[16px] text-[var(--k-text-2)]">
-                  Quests arrive in a later update. The journal and the HUD tracker are ready for
-                  them.
-                </p>
-              </Panel>
-            )}
-          </div>
+        <div ref={mainRef} className="h-full">
+          {tab === 'loadout' ? (
+            <LoadoutTab
+              mode={mode}
+              setPrompts={setTabPrompts}
+              setFooterAction={() => {}}
+              go={follow}
+              link={link}
+            />
+          ) : (
+            <div className="h-full overflow-y-auto px-8 py-6">
+              {/* Today's panels until Phase 2's panes, at their own size: the column undoes the UI zoom. */}
+              <div className="mx-auto flex w-[960px] max-w-full flex-col gap-4 [zoom:calc(1/var(--ui-scale,1))]">
+                {tab === 'skills' && <AbilitiesPanel />}
+                {tab === 'forge' && <ForgePanel onSelect={openItem} />}
+                {tab === 'codex' && (
+                  <>
+                    <CodexPanel />
+                    {/* Out of the chain builder; 2C's Codex panes take it in. */}
+                    <ReactionsGrid reactionsSeen={profile.reactionsSeen} />
+                    {profile.stats.dives > 0 && <Records />}
+                  </>
+                )}
+                {tab === 'quests' && (
+                  <Panel title="Quests" testId="quests-empty" scroll={false}>
+                    <p className="text-[16px] text-[var(--k-text-2)]">
+                      Quests arrive in a later update. The journal and the HUD tracker are ready for
+                      them.
+                    </p>
+                  </Panel>
+                )}
+              </div>
+            </div>
+          )}
         </div>
       </Screen>
```

**X2 · Integrator (E2E).** Ids the Loadout keeps for the specs: `paper-doll`, `slot-<slot>`, `mana-strip` (contains "Skills ›"), `bag-panel`, `bag-item`, `equip-best`, `salvage-junk`, `item-sheet` (now the compare pane's root, always shown after a first save), `item-name`, `item-mana`, `item-compare`, `compare-as-is`, `compare-home`, `compare-table`, `attune-delta`, `bind-prompt*`, `transfer-button`, `transfer-leaves`, `transfer-runes`, `equip-button`, `salvage-button`, `equip-locked`, `item-moveset`, `delve-howto` (in the compare column on a first save). New: `loadout-tab`, `loadout-stats`, `loadout-moveset(-<skill>)`, `bag-count`, `bag-filter-<all|weapons|armor|jewelry|upgrades>`, `bag-sort`, `auto-salvage(-<off|rarity>)`, `unequip-button`, `lock-button`, `forge-it`. Gone from the Anvil: `attune-note`, `open-builder`, `upgrade-badge`, the sheet's `forge-locked` (the sheet keeps its own ids in the dive). With X1 on the scratch copy, D01, D03–D09, R01–R07 and G01–G07 pass unchanged; **D02** fails only at its last line (the compare pane stays). Its Anvil half becomes (checked):

```ts
    await page.getByTestId('bag-item').first().click();
    const notNow = page.getByTestId('bind-prompt-not-now');
    if (await notNow.isVisible()) await notNow.click();
    else await page.getByTestId('equip-button').click();
    await expect(sheet).toContainText('Equipped · your');
```

(replacing D02's last five lines, from `await page.getByTestId('bag-item').first().click();` through `await expect(sheet).toBeHidden();`: an off-pair item now shows the bind choice in place of Equip, and the pane stays, showing the item now worn).

**X3 · 2C (`__tests__/ItemDetailSheet.test.tsx`).** 2A deletes the header's `heroChains,` line and `import { BagPanel } from '../BagPanel';`; 2C deletes the `ForgePanel` import on the next line and its Forge tests. The two header edits touch adjacent lines, so the merge reports one conflict there: keep neither import. The test bodies don't overlap. 2A leaves `ForgePanel`'s tests alone.

**X4 · 2C (for its `GearList` and bench, no edit needed).** `ItemTile` keeps its props (now also `asIs` and any button attribute) and forwards its ref; `deltaMark(delta, asIs)` gives ▲ / ◇ / ▼. `format.ts` gains `formatStatValue`. `ItemHeader` (1C's) still has its legacy sizes (11–12 px) and emoji (`⚔️ Melee`, `🎯 Ranged`, the mana icon); it renders in the compare pane as it is, for whoever restyles `items/` (unassigned in Phase 2).

**X5 · Later (3b).** `ItemTile` no longer uses `delve.css`'s `.delve-tile*` classes except `.delve-tile-mana` (the pip); `.delve-tile` stays because `kit-css.test.ts` asserts its rule. Delete them with that row when 3b retires the legacy tile CSS.

## Where the spec left room

- **The bind choice** ("an off-pair item shows today's BindPrompt content inline"): shown in the compare pane whenever the shown bag item would ask (`needsBind`: a primary, no secondary, the item's element not the primary, no "Not now" to it this session), in place of the Equip button, since Bind and Not now both equip. Equip by right-click or A on such a tile selects it and puts the focus on Bind. It is a block in the pane, not a mode: no scope, no Back, so Esc still opens the menu. Today's copy, ids and Power figures are kept; the refused bind's toast too.
- **What the compare pane shows:** the hovered tile (mouse), else the selected one (a click, Enter, or the pad's focus: decided item 36), else on a first save the how-to (`delve-howto`), else the worn weapon ("Your weapon"). A click on a worn tile selects it ("Equipped · your <slot>": its lines, a weapon's moveset, Unequip, Lock, Forge it). A link `{ tab: 'loadout', uid }` selects `uid`.
- **Prompts:** Select (Click / A, drawn), Equip (RMB / A, drawn: A is never a prompt's), Full compare (hold Shift / LT), Salvage (Del / X) and **Lock** (L / Y). The spec's list has no Lock, but the input map binds it and the pane's Lock button shows its glyph, and a prompt is the only way a binding acts. Salvage and Lock act on the hovered or selected item only, never the worn-weapon fallback. Paused, only Select and Full compare.
- **Full compare** adds the item's stat lines (`ItemStatLines`) and a weapon's moveset (`MovesetView`) to the default `CompareTable` and `LegendaryBox`.
- **Salvage:** a precious item (rare and up, or holding runes: today's rule) arms on the first press ("Press again to melt", with what its runes become) and melts on a second within 2 s; the button shows the gain as a `Price` (Links, scrap, Mana Dust).
- **Sort** is one chip that steps Power → Rarity → Slot → Newest (no dropdown: one press on every device). **Auto-salvage up to** is a chip opening a `Segmented` of Off, Common … Epic that sets every rarity up to the one chosen.
- **Tiles:** ◇ marks a weapon better only with your moveset moved onto it (`compareItem`'s home value up, its `'asIs'` value not), as the loot tray and pickup feed count it; ▲ reads the as-is value. The "+N" forge level leaves the tile (the pane's header shows it); the mana pip stays.
- **Stats "from `profileStats`":** Damage is `estimateCombat(...).dps` and attack speed the weapon's blows over its cycle, as `PaperDoll` showed them; Mana and Regen are `manaPool`.
- **Pause:** every item action becomes the `equip-locked` note ("Equip at the Anvil, between dives"); Equip best, Salvage junk and auto-salvage disable; NEW stays on dive finds.
- **Fit:** at 1920×1080 the equipped pane fits with a one-element pair; with two, `AttunementBars` (2·0's block, taller than the mockup's bars) makes it scroll a few px. At the 0.75 floor the bag's chips wrap to two rows and the tiles shrink to their 56 px floor through `minmax(56px, 84px)`.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `ui/p2-2a` (Task 9 on `ui/p2`, at integration), staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd` to it.
- **Line endings:** a fresh worktree checks these files out CRLF; keep each file's own (the Edit tool does). New files are written LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every file the commit blocks format passed `npx prettier --check --end-of-line auto` at the base or is new, and the code below is already formatted (checked on the scratch copy), so `--write` changes nothing typed as written. `__tests__/ItemDetailSheet.test.tsx` is not clean at the base: **never format it**, only hand-edit it.
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit. "Replace the lines from `A` up to (not including) `B` with: C" is one Edit from the start of the line reading `A` (ignoring its indentation) to the end of the line before the one reading `B`; a blank line at C's end stays. "Delete the lines from `A` up to (not including) `B`." removes them. "Delete the lines:" followed by a block removes exactly those whole lines. "Create `f`:" and "Overwrite `f`:" are a Write. Every anchor is unique in its file at that point; apply each file's edits top to bottom.
- **Checked on a scratch copy:** `ui/p2` at `807b324` (`git archive`, junctions to the `alloy-ui-p2` worktree's `node_modules`). Every task's edits were applied in order by a script that checks each anchor once in its file; every FAIL and PASS below was run; the typecheck stayed clean and every file formatted. The Delve E2E (`delve`, `delve-runes`, `delve-gamepad` on `desktop`) ran against Tasks 1–8 plus X1's reference wiring.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Engine bundle (once) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| E2E (at integration) | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts --project=desktop e2e/delve.spec.ts e2e/delve-runes.spec.ts e2e/delve-gamepad.spec.ts)` |


## Chunk 1: The tile, the tooltip and the compare views

### Task 1: `ItemTile` is a kit `Tile`, and ◇ marks a weapon better only as a home

Every item tile in the Delve draws the forge socket. `ItemTile` keeps its props (and its forwarded ref, which the loot tray's fly-in and the tooltip need), passes any button attribute through, and adds `asIs`: a weapon's Power as it is, so ▲ reads it and ◇ marks one better only once your moveset moves onto it.

**Files:**
- Overwrite: `packages/client/src/features/delve/__tests__/ItemTile.test.tsx`
- Overwrite: `packages/client/src/features/delve/ItemTile.tsx`

- [ ] **Step 1: The failing test**

Overwrite `packages/client/src/features/delve/__tests__/ItemTile.test.tsx`:

```tsx
import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { ItemTile, deltaMark } from '../ItemTile';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();
const item = generateItem(
  registry,
  { uid: 't1', ilvl: 4, rarity: 'epic', slot: 'ring' },
  new SeededRNG(3),
);
const mark = (container: HTMLElement) =>
  container.querySelector('.k-tile-delta [data-glyph]')?.getAttribute('data-glyph') ?? null;

describe('ItemTile', () => {
  it('is a kit tile: ▲ for a gain, ▼ for a loss, nothing for rounding noise', () => {
    const { container, rerender } = render(<ItemTile item={item} delta={0.2} />);
    expect(container.querySelector('.k-tile')).not.toBeNull();
    expect(mark(container)).toBe('up');
    expect(screen.getByRole('button')).toHaveAccessibleName(`${item.name}, epic, upgrade`);
    rerender(<ItemTile item={item} delta={-0.2} />);
    expect(mark(container)).toBe('down');
    rerender(<ItemTile item={item} delta={0.001} />);
    expect(mark(container)).toBeNull();
  });

  it('marks a weapon better only as a home for your moveset ◇, and ▲ by its value as it is', () => {
    expect(deltaMark(0.2, -0.1)).toBe('potential');
    expect(deltaMark(0.2, 0.1)).toBe('up');
    expect(deltaMark(-0.2, -0.1)).toBe('down');
    expect(deltaMark(0.001, 0)).toBeNull();
    expect(deltaMark(null)).toBeNull();
    const { container } = render(<ItemTile item={item} delta={0.2} asIs={-0.1} />);
    expect(mark(container)).toBe('potential');
  });

  it('exposes rarity, fires onClick and forwards its ref to the button', () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(<ItemTile ref={ref} item={item} onClick={onClick} testId="tile" />);
    const tile = screen.getByTestId('tile');
    expect(tile).toHaveAttribute('data-rarity', 'epic');
    expect(ref.current).toBe(tile);
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('marks NEW (not on a locked item), the lock, and an accessible empty slot', () => {
    const { rerender } = render(<ItemTile item={item} isNew />);
    expect(screen.getByRole('button')).toHaveAccessibleName(`${item.name}, epic, new`);
    rerender(<ItemTile item={{ ...item, locked: true }} isNew />);
    expect(screen.getByRole('button')).toHaveAccessibleName(`${item.name}, epic, locked`);
    rerender(<ItemTile item={null} slot="helm" />);
    expect(screen.getByRole('button', { name: /Empty helm slot/ })).toBeInTheDocument();
  });

  it('marks the item mana affinity with a colored pip', () => {
    const { container } = render(<ItemTile item={{ ...item, mana: 'frost' }} />);
    const pip = container.querySelector('.delve-tile-mana');
    expect(pip).toHaveAttribute('data-mana', 'frost');
    expect(pip).toHaveAttribute('title', 'Frost affinity');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ItemTile.test.tsx)`
Expected: FAIL, 3 failed | 2 passed (5): "is a kit tile…" (`expected null not to be null`: no `.k-tile`), "marks a weapon better only as a home…" (`(0 , deltaMark) is not a function`), and "marks NEW…" (the accessible name has no ", new").

- [ ] **Step 3: The implementation**

Overwrite `packages/client/src/features/delve/ItemTile.tsx`:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { GearItem, GearSlot } from '@alloy/engine';
import { Tile, type TileProps } from './kit';
import { ItemIcon } from './ItemIcon';
import { getDelveRegistry } from './registry';
import { UPGRADE_EPSILON, manaStyle } from './format';

const EMPTY_BASE: Record<GearSlot, string> = {
  weapon: 'sword',
  helm: 'helm',
  chest: 'cuirass',
  gloves: 'gauntlets',
  boots: 'greaves',
  amulet: 'amulet',
  ring: 'ring',
};

/**
 * A tile's mark from its Power changes: ▲ better as it is (`asIs`, else `delta`), ◇ better only
 * with your moveset moved onto it (`delta`, a weapon's value as a home: Transfer), ▼ worse as it is.
 */
export function deltaMark(
  delta: number | null | undefined,
  asIs: number | null | undefined = delta,
): TileProps['delta'] {
  if (delta === null || delta === undefined) return null;
  const now = asIs ?? delta;
  if (now > UPGRADE_EPSILON) return 'up';
  if (delta > UPGRADE_EPSILON) return 'potential';
  return now < -UPGRADE_EPSILON ? 'down' : null;
}

export interface ItemTileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  item: GearItem | null;
  /** Needed to draw an empty slot silhouette. */
  slot?: GearSlot;
  size?: number;
  /** Power change if equipped (fraction); a weapon's as a home for your moveset. */
  delta?: number | null;
  /** A weapon's Power change as it is; ▲ reads it, and ◇ marks one better only as a home. */
  asIs?: number | null;
  selected?: boolean;
  dim?: boolean;
  isNew?: boolean;
  equipped?: boolean;
  testId?: string;
  label?: string;
}

/** An item as a kit `Tile`: its icon, rarity, ▲ ▼ ◇ mark, NEW, lock and equipped marks, and its mana pip. */
export const ItemTile = forwardRef<HTMLButtonElement, ItemTileProps>(function ItemTile(
  { item, slot, size = 56, delta, asIs, dim, isNew, label, style, ...rest },
  ref,
) {
  const mana = item ? manaStyle(getDelveRegistry(), item.mana) : null;
  return (
    <Tile
      {...rest}
      {...{ ref }}
      rarity={item?.rarity ?? null}
      size={size}
      delta={deltaMark(delta, asIs)}
      fresh={!!isNew && !item?.locked}
      locked={!!item?.locked}
      label={label ?? (item ? `${item.name}, ${item.rarity}` : `Empty ${slot ?? ''} slot`)}
      style={dim ? { ...style, opacity: 0.35 } : style}
      icon={
        item ? (
          <>
            <ItemIcon baseId={item.baseId} rarity={item.rarity} />
            {mana && (
              <span
                className="delve-tile-mana"
                data-mana={item.mana}
                title={`${mana.name} affinity`}
                style={{ background: mana.color }}
              />
            )}
          </>
        ) : slot ? (
          <ItemIcon baseId={EMPTY_BASE[slot]} rarity="common" ghost />
        ) : undefined
      }
    />
  );
});
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ItemTile.test.tsx)`
Expected: PASS (5 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 1 tests in F files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/__tests__/ItemTile.test.tsx src/features/delve/ItemTile.tsx)
git add packages/client/src/features/delve/__tests__/ItemTile.test.tsx packages/client/src/features/delve/ItemTile.tsx
git commit -m "feat(client): ItemTile draws a kit Tile, with ◇ for a weapon better only as a home" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The kit tooltip measures its card, flips or clamps it, and follows a scroll

Carried from the Phase 1 review: the card was placed once at render, from the trigger's box alone. Now it renders hidden, a layout effect measures it and places it beside the trigger (on the other side when it would leave the viewport and fits there, then clamped inside the viewport, every box divided by the zoom the card sits under), and it is placed again on any scroll (capture: a focus scrolling its trigger into view) and on resize while open. The equipped tiles' `ItemTooltip` is its first user.

**Files:**
- Modify: `packages/client/src/features/delve/kit/__tests__/Tooltip.test.tsx`
- Modify: `packages/client/src/features/delve/kit/Tooltip.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/kit/__tests__/Tooltip.test.tsx`:

Replace:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
```

with:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
```

Replace:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
```

with:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
```

Replace the lines from `left: '220px', // (300 + 30) / 1.5` up to (not including) `it('renders inline under the HUD zoom with portal off, and stays open while asked', () => {` with:

```tsx
      left: '220px', // (300 + 30) / 1.5, less half the card (0 wide here)
      top: '88px', // 150 / 1.5 − 12, less the card's height
    });
  });

  it('measures its card, flips or clamps it at the viewport edge, and follows a scroll or resize', () => {
    // jsdom's viewport is 1024 × 768; the card is 300 × 200.
    const card = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this.getAttribute('role') === 'tooltip'
          ? DOMRect.fromRect({ width: 300, height: 200 })
          : new DOMRect();
      });
    render(
      <Tooltip content={() => 'tip'}>
        <button type="button">Slot</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button');
    at(trigger, 900, 700, 60, 30);
    fireEvent.mouseEnter(trigger);
    // No room on the right: on the left (900 − 12 − 300), and clamped to the bottom (768 − 200).
    expect(screen.getByRole('tooltip')).toHaveStyle({ left: '588px', top: '568px' });
    at(trigger, 100, 40, 60, 30);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('tooltip')).toHaveStyle({ left: '172px', top: '40px' });
    at(trigger, 200, 50, 60, 30);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByRole('tooltip')).toHaveStyle({ left: '272px', top: '50px' });
    card.mockRestore();
  });

```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/Tooltip.test.tsx)`
Expected: FAIL, 1 failed | 4 passed (5): "measures its card, flips or clamps it…" (`toHaveStyle`: expected `left: 588px; top: 568px`; the old card sits at the trigger's right, 972 px).

- [ ] **Step 3: The implementation**

In `packages/client/src/features/delve/kit/Tooltip.tsx`:

Replace the lines from `/** The gap between a trigger and its card, in design px. */` up to (not including) `/** A tooltip's card: a plate (the hub) or glass (the HUD), with a title row and optional prompts. */` with:

```tsx
/** The gap between a trigger and its card, in design px. */
const GAP = 12;

type Placement = NonNullable<TooltipProps['placement']>;

const OPPOSITE: Record<Placement, Placement> = {
  right: 'left',
  left: 'right',
  top: 'bottom',
  bottom: 'top',
};

type TriggerProps = {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
  'aria-describedby'?: string;
  ref?: Ref<HTMLElement>;
};

/**
 * The card's top-left, in the px of the layer it renders under (every box ÷ that zoom `z`):
 * beside the trigger on `placement`'s side, on the other side when it would leave the viewport
 * there and fits on that one, then clamped inside the viewport.
 */
function place(trigger: DOMRect, card: DOMRect, z: number, placement: Placement): CSSProperties {
  const [l, t, r, b] = [trigger.left, trigger.top, trigger.right, trigger.bottom].map((v) => v / z);
  const [w, h] = [card.width / z, card.height / z];
  const [vw, vh] = [window.innerWidth / z, window.innerHeight / z];
  const midX = (l + r) / 2 - w / 2;
  const at: Record<Placement, { left: number; top: number }> = {
    right: { left: r + GAP, top: t },
    left: { left: l - GAP - w, top: t },
    top: { left: midX, top: t - GAP - h },
    bottom: { left: midX, top: b + GAP },
  };
  const spills: Record<Placement, (p: { left: number; top: number }) => boolean> = {
    right: (p) => p.left + w > vw,
    left: (p) => p.left < 0,
    top: (p) => p.top < 0,
    bottom: (p) => p.top + h > vh,
  };
  const other = OPPOSITE[placement];
  const p =
    spills[placement](at[placement]) && !spills[other](at[other]) ? at[other] : at[placement];
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(max, 0));
  return { left: clamp(p.left, vw - w), top: clamp(p.top, vh - h) };
}

/**
 * Shows `content()` beside its child on hover and on focus (the pad's focus too), or while
 * `openWhile`. Portalled into uiLayer() by default; `portal={false}` renders it inline, under
 * the zoom the child sits under (the HUD). Placed once drawn (it measures itself), flipped or
 * clamped at the viewport's edge, and placed again on any scroll (a focus scrolling its trigger
 * into view) and on resize.
 */
export function Tooltip({
  content,
  children,
  placement = 'right',
  openWhile,
  portal = true,
}: TooltipProps): ReactElement {
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const open = (openWhile ?? false) || hovered || focused;
  const own = children.props as TriggerProps;
  const ownRef = own.ref;

  const ref = useCallback(
    (el: HTMLElement | null) => {
      anchor.current = el;
      if (typeof ownRef === 'function') ownRef(el);
      else if (ownRef) ownRef.current = el;
    },
    [ownRef],
  );

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const measure = () => {
      const el = anchor.current;
      const card = tip.current;
      if (!el || !card) return;
      const z = layerZoom(portal ? uiLayer() : el);
      setPos(place(el.getBoundingClientRect(), card.getBoundingClientRect(), z, placement));
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, placement, portal]);

  const trigger = cloneElement(children as ReactElement<TriggerProps>, {
    ref,
    onMouseEnter: (e) => {
      own.onMouseEnter?.(e);
      setHovered(true);
    },
    onMouseLeave: (e) => {
      own.onMouseLeave?.(e);
      setHovered(false);
    },
    onFocus: (e) => {
      own.onFocus?.(e);
      setFocused(true);
    },
    onBlur: (e) => {
      own.onBlur?.(e);
      setFocused(false);
    },
    'aria-describedby': open ? id : own['aria-describedby'],
  });

  let card: ReactNode = null;
  if (open) {
    card = (
      <div
        ref={tip}
        role="tooltip"
        id={id}
        className="k-tip"
        style={pos ?? { left: 0, top: 0, visibility: 'hidden' }}
      >
        {content()}
      </div>
    );
    if (portal) card = createPortal(card, uiLayer());
  }

  return (
    <>
      {trigger}
      {card}
    </>
  );
}

```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/Tooltip.test.tsx)`
Expected: PASS (5 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 2 tests in F files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/__tests__/Tooltip.test.tsx src/features/delve/kit/Tooltip.tsx)
git add packages/client/src/features/delve/kit/__tests__/Tooltip.test.tsx packages/client/src/features/delve/kit/Tooltip.tsx
git commit -m "fix(client): the kit tooltip measures its card, flips or clamps it at the viewport, and follows scroll and resize" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: The compare table and the Power delta at the kit's sizes; `formatStatValue`

The compare pane's two item views move to the kit's type scale (nothing under 14 px) and its gain and loss colours, and `CompareTable` takes a stat's value from `formatStatValue` instead of slicing the label off `formatStat` (carried from the Phase 1 review). `ItemTooltip` and the dive's item sheet show them too.

**Files:**
- Modify: `packages/client/src/features/delve/items/__tests__/CompareTable.test.tsx`
- Modify: `packages/client/src/features/delve/items/__tests__/comparison.test.tsx`
- Modify: `packages/client/src/features/delve/format.ts`
- Modify: `packages/client/src/features/delve/items/CompareTable.tsx`
- Modify: `packages/client/src/features/delve/items/PowerDelta.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/items/__tests__/CompareTable.test.tsx`:

Replace:

```tsx
    expect(rows[0].children[2]).toHaveStyle({ color: '#f87171' });
    expect(rows[1].children[2]).toHaveStyle({ color: '#4ade80' });
```

with:

```tsx
    expect(rows[0].children[2]).toHaveStyle({ color: '#f6757a' });
    expect(rows[1].children[2]).toHaveStyle({ color: '#63c74d' });
```

Replace:

```tsx
    expect(screen.getByTestId('compare-row-armor').children[2]).toHaveStyle({ color: '#4ade80' });
```

with:

```tsx
    expect(screen.getByTestId('compare-row-armor').children[2]).toHaveStyle({ color: '#63c74d' });
```

In `packages/client/src/features/delve/items/__tests__/comparison.test.tsx`:

Replace:

```tsx
    expect(screen.getByText('+12%', { exact: false })).toHaveStyle({ color: '#4ade80' });
    expect(screen.getByText('−4%', { exact: false })).toHaveStyle({ color: '#f87171' });
```

with:

```tsx
    expect(screen.getByText('+12%', { exact: false })).toHaveStyle({ color: '#63c74d' });
    expect(screen.getByText('−4%', { exact: false })).toHaveStyle({ color: '#f6757a' });
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/items/__tests__/CompareTable.test.tsx src/features/delve/items/__tests__/comparison.test.tsx)`
Expected: FAIL, 3 failed | 4 passed (7): both `CompareTable` tests and "shows Power, Damage and Toughness…" (`toHaveStyle`: the old `#f87171` / `#4ade80`).

- [ ] **Step 3: The implementation**

In `packages/client/src/features/delve/format.ts`:

Replace:

```ts
/** "+12% Crit Chance" / "+340 Armor" */
export function formatStat(registry: DataRegistry, stat: HeroStatKey, value: number): string {
  const def = registry.getGearAffix(stat);
  const label = def?.label ?? stat;
  if (def?.unit === 'pct') return `+${formatPct(value, def.decimals)}% ${label}`;
  return `+${formatNumber(value)} ${label}`;
}
```

with:

```ts
/** "+12%" / "+340": a stat's value without its label. */
export function formatStatValue(registry: DataRegistry, stat: HeroStatKey, value: number): string {
  const def = registry.getGearAffix(stat);
  return def?.unit === 'pct' ? `+${formatPct(value, def.decimals)}%` : `+${formatNumber(value)}`;
}

/** "+12% Crit Chance" / "+340 Armor" */
export function formatStat(registry: DataRegistry, stat: HeroStatKey, value: number): string {
  return `${formatStatValue(registry, stat, value)} ${registry.getGearAffix(stat)?.label ?? stat}`;
}
```

In `packages/client/src/features/delve/items/CompareTable.tsx`:

Replace:

```tsx
import { formatStat } from '../format';
```

with:

```tsx
import { formatStatValue } from '../format';

/** Gain and loss text (the kit's `--k-ok` and `--k-bad-text`). */
const GAIN = '#63c74d';
const LOSS = '#f6757a';
```

Replace:

```tsx
  // formatStat's "+12% Crit Chance" without its label.
  const value = (stat: HeroStatKey, v: number | undefined) =>
    v === undefined ? '—' : formatStat(registry, stat, v).slice(0, -label(stat).length - 1);
```

with:

```tsx
  const value = (stat: HeroStatKey, v: number | undefined) =>
    v === undefined ? '—' : formatStatValue(registry, stat, v);
```

Replace:

```tsx
    <table className="w-full text-xs" data-testid="compare-table">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-stone-500">
          <th className="text-left font-normal">Stat</th>
          <th className="text-right font-normal">Worn</th>
          <th className="text-right font-normal">This</th>
```

with:

```tsx
    <table className="w-full text-[16px]" data-testid="compare-table">
      <thead>
        <tr className="k-label">
          <th className="pb-1.5 text-left font-normal">Stat</th>
          <th className="w-[90px] text-right font-normal">Worn</th>
          <th className="w-[90px] text-right font-normal">This</th>
```

Replace:

```tsx
            <tr key={stat} data-testid={`compare-row-${stat}`}>
              <td className="text-stone-300">{label(stat)}</td>
              <td className="text-right text-stone-400">{value(stat, was)}</td>
              <td
                className="text-right font-semibold"
                style={{ color: d > 0 ? '#4ade80' : d < 0 ? '#f87171' : '#d6d3d1' }}
              >
```

with:

```tsx
            <tr
              key={stat}
              className="border-t-2 border-[#3a4466]"
              data-testid={`compare-row-${stat}`}
            >
              <td className="py-[7px] text-[#c0cbdc]">{label(stat)}</td>
              <td className="text-right text-[#8b9bb4]">{value(stat, was)}</td>
              <td
                className="text-right font-semibold"
                style={{ color: d > 0 ? GAIN : d < 0 ? LOSS : '#c0cbdc' }}
              >
```

In `packages/client/src/features/delve/items/PowerDelta.tsx`:

Replace:

```tsx
      <div className="text-center text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
```

with:

```tsx
      <div className="k-label text-center">{label}</div>
```

Replace:

```tsx
  const color = v > UPGRADE_EPSILON ? '#4ade80' : v < -UPGRADE_EPSILON ? '#f87171' : '#a8a29e';
```

with:

```tsx
  // Gain and loss text (the kit's `--k-ok` and `--k-bad-text`), else secondary.
  const color = v > UPGRADE_EPSILON ? '#63c74d' : v < -UPGRADE_EPSILON ? '#f6757a' : '#c0cbdc';
```

Replace:

```tsx
      <span className="text-[10px] uppercase tracking-wider text-stone-400">{label}</span>
      <span className="delve-display text-base font-bold" style={{ color }}>
```

with:

```tsx
      <span className="k-label">{label}</span>
      <span className="k-disp text-[22px]" style={{ color }}>
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/items/__tests__/CompareTable.test.tsx src/features/delve/items/__tests__/comparison.test.tsx)`
Expected: PASS (7 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 2 tests in F files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/items/__tests__/CompareTable.test.tsx src/features/delve/items/__tests__/comparison.test.tsx src/features/delve/format.ts src/features/delve/items/CompareTable.tsx src/features/delve/items/PowerDelta.tsx)
git add packages/client/src/features/delve/items/__tests__/CompareTable.test.tsx packages/client/src/features/delve/items/__tests__/comparison.test.tsx packages/client/src/features/delve/format.ts packages/client/src/features/delve/items/CompareTable.tsx packages/client/src/features/delve/items/PowerDelta.tsx
git commit -m "feat(client): the compare table and Power delta at the kit's sizes and colours; formatStatValue" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The equipped and bag panes

### Task 4: The equipped pane

The Loadout's left pane (`paper-doll`): three slots down the left (Weapon, Gloves, Ring) and four down the right (Helm, Amulet, Chest, Boots) of an 84 / 200 / 84 px grid (the middle column shrinks to fit the 430 px pane), round the hero (`PixelSprite`, scale 10) on the anvil glyph over a stepped cyan glow; each worn tile shows its `ItemTooltip` and a click selects it. Then the stats, the pair's `AttunementBars` as the `mana-strip` (to the Mana view on Skills) and the weapon's moveset box.

**Files:**
- Create: `packages/client/src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx`
- Create: `packages/client/src/features/delve/hub/loadout/EquippedPane.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useDelveStore } from '@/stores/delveStore';
import { EquippedPane } from '../EquippedPane';

const store = () => useDelveStore.getState();
const open = () => {
  const props = { selected: null, onSelect: vi.fn(), go: vi.fn() };
  render(<EquippedPane {...props} />);
  return props;
};

describe('the equipped pane', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'frost');
  });

  it('draws the paper doll round the hero on the anvil, each slot labelled', () => {
    open();
    const doll = screen.getByTestId('paper-doll');
    const slots = within(doll)
      .getAllByTestId(/^slot-/)
      .map((t) => t.dataset.testid);
    expect(slots).toEqual([
      'slot-weapon',
      'slot-gloves',
      'slot-ring',
      'slot-helm',
      'slot-amulet',
      'slot-chest',
      'slot-boots',
    ]);
    expect(within(doll).getByRole('img', { name: 'Your hero' })).toBeInTheDocument();
    expect(within(doll).getByRole('button', { name: /Empty helm slot/ })).toBeInTheDocument();
    expect(doll).toHaveTextContent('EquippedFrost');
  });

  it("shows the hero's damage, life, attack speed, armor, mana and regen", () => {
    open();
    expect(screen.getByTestId('loadout-stats')).toHaveTextContent(
      /^Damage\d[\d.k]*Life\d+Attack speed\d+\.\d\d\/sArmor\d+Mana\d+Regen\d+\.\d\/s$/,
    );
  });

  it("the attunement block shows the pair's and opens the Mana view on Skills", () => {
    const props = open();
    const strip = screen.getByTestId('mana-strip');
    expect(strip).toHaveTextContent('Skills ›');
    expect(within(strip).getByTestId('attune-frost')).toBeInTheDocument();
    expect(within(strip).queryByTestId('attune-fire')).toBeNull();
    fireEvent.click(strip);
    expect(props.go).toHaveBeenCalledWith({ tab: 'skills', view: 'mana' });
  });

  it("counts the weapon's slots of each skill's cap, and opens Skills", () => {
    const props = open();
    const box = screen.getByTestId('loadout-moveset');
    expect(box).toHaveTextContent(`Moveset · ${store().profile.equipped.weapon!.name}`);
    // The common sword carries Basic and Primary.
    expect(screen.getByTestId('loadout-moveset-basic')).toHaveTextContent('Basic 3/5');
    expect(screen.getByTestId('loadout-moveset-primary')).toHaveTextContent('Primary 1/5');
    expect(screen.getByTestId('loadout-moveset-defensive')).toHaveTextContent('Defensive —');
    fireEvent.click(within(box).getByRole('button', { name: 'Skills ›' }));
    expect(props.go).toHaveBeenCalledWith({ tab: 'skills' });
  });

  it('a worn tile shows its card on hover, and a click selects it', () => {
    const props = open();
    const weapon = store().profile.equipped.weapon!;
    const tile = screen.getByTestId('slot-weapon');
    fireEvent.mouseEnter(tile);
    expect(screen.getByRole('tooltip')).toHaveTextContent(weapon.name);
    fireEvent.mouseLeave(tile);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(tile);
    expect(props.onSelect).toHaveBeenCalledWith(weapon.uid);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx)`
Expected: FAIL, no tests: `Failed to resolve import "../EquippedPane"`.

- [ ] **Step 3: The implementation**

Create `packages/client/src/features/delve/hub/loadout/EquippedPane.tsx`:

```tsx
import { useMemo, type ReactElement } from 'react';
import {
  CHAIN_SKILLS,
  carriedSkills,
  estimateCombat,
  heroChains,
  manaPool,
  movesetOf,
  pairElements,
  profileStats,
  referenceDepth,
  type GearSlot,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Glyph, Panel, PixelSprite } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemTile } from '../../ItemTile';
import { ItemTooltip } from '../../items/ItemTooltip';
import { AttunementBars } from '../../items/AttunementBars';
import { SKILL_NAME } from '../../chains/chain-text';
import { SLOT_LABEL, formatNumber, manaStyle } from '../../format';
import type { HubLink } from '../types';

/** The paper doll's slots: three down the left, four down the right, by grid column and row. */
const DOLL: [GearSlot, 1 | 3, number][] = [
  ['weapon', 1, 1],
  ['gloves', 1, 2],
  ['ring', 1, 3],
  ['helm', 3, 1],
  ['amulet', 3, 2],
  ['chest', 3, 3],
  ['boots', 3, 4],
];

/** The stepped cyan glow under the hero on the anvil. */
const GLOW =
  'radial-gradient(ellipse at 50% 78%, rgba(44, 232, 245, 0.22) 0 22%, rgba(44, 232, 245, 0.08) 22% 38%, transparent 38%)';

/**
 * The Loadout's left pane: the paper doll round the hero on the anvil (each worn item's card on
 * hover or focus, a click shows it in the compare pane), the hero's stats, the pair's attunement
 * (to the Mana view on Skills) and the weapon's moveset (slots used of each skill's cap).
 */
export function EquippedPane({
  selected,
  onSelect,
  go,
}: {
  selected: string | null;
  onSelect: (uid: string) => void;
  go: (to: HubLink) => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const newUids = useDelveStore((s) => s.newUids);
  const { equipped, pair } = profile;
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [registry, equipped, pair],
  );
  const chains = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  const dps = useMemo(
    () => estimateCombat(stats, registry, referenceDepth(profile), chains).dps,
    [stats, registry, profile, chains],
  );
  const pool = manaPool(stats, registry);
  const blows = stats.weapon.blows;
  const speed = blows.length / (stats.attackInterval * blows.reduce((a, b) => a + b.time, 0));
  const elements = pairElements(pair);
  const weapon = equipped.weapon;
  const cap = registry.getDelveBalance().chains.cap;
  const slots = weapon ? movesetOf(registry, weapon).slots : null;
  const carried = weapon ? carriedSkills(registry, weapon.rarity) : [];

  const rows: [string, string, boolean?][] = [
    ['Damage', formatNumber(dps)],
    ['Life', formatNumber(stats.maxHp)],
    ['Attack speed', `${speed.toFixed(2)}/s`],
    ['Armor', formatNumber(stats.armor)],
    ['Mana', formatNumber(pool.max), true],
    ['Regen', `${pool.regen.toFixed(1)}/s`, true],
  ];

  return (
    <Panel
      title="Equipped"
      aside={
        <span className="k-caption">
          {elements.map((m) => manaStyle(registry, m).name).join(' · ')}
        </span>
      }
      testId="paper-doll"
    >
      <div
        className="grid justify-center gap-x-[18px] gap-y-1"
        style={{ gridTemplateColumns: '84px minmax(0, 200px) 84px' }}
      >
        <div
          className="flex flex-col items-center justify-end pb-1.5"
          style={{ gridColumn: 2, gridRow: '1 / 5', background: GLOW }}
        >
          <PixelSprite id="hero" scale={10} context="ui" label="Your hero" />
          <span aria-hidden className="-mt-1.5">
            <Glyph id="anvil" size={160} />
          </span>
        </div>
        {DOLL.map(([slot, col, row]) => {
          const item = equipped[slot] ?? null;
          const tile = (
            <ItemTile
              item={item}
              slot={slot}
              size={84}
              isNew={item ? newUids[item.uid] : false}
              selected={!!item && selected === item.uid}
              onClick={item ? () => onSelect(item.uid) : undefined}
              testId={`slot-${slot}`}
            />
          );
          return (
            <div
              key={slot}
              className="flex flex-col items-center gap-1"
              style={{ gridColumn: col, gridRow: row }}
            >
              {item ? <ItemTooltip uid={item.uid}>{tile}</ItemTooltip> : tile}
              <span className="k-label">{SLOT_LABEL[slot]}</span>
            </div>
          );
        })}
      </div>

      <dl className="grid grid-cols-2 gap-x-[22px] text-[16px]" data-testid="loadout-stats">
        {rows.map(([label, value, mana]) => (
          <div
            key={label}
            className="flex justify-between border-b-2 border-[var(--k-steel-1)] py-1"
          >
            <dt className="text-[var(--k-text-3)]">{label}</dt>
            <dd className="font-bold" style={mana ? { color: 'var(--k-mana)' } : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        className="flex flex-col gap-2 text-left"
        onClick={() => go({ tab: 'skills', view: 'mana' })}
        data-testid="mana-strip"
      >
        <span className="flex w-full items-baseline justify-between">
          <span className="k-label">Attunement</span>
          <span className="k-caption">Skills ›</span>
        </span>
        <AttunementBars stats={stats} elements={elements} />
      </button>

      {weapon && slots && (
        <div className="k-well mt-auto flex flex-col gap-1 p-3" data-testid="loadout-moveset">
          <div className="flex items-baseline justify-between gap-3">
            <span className="k-disp truncate text-[18px]">Moveset · {weapon.name}</span>
            <button type="button" className="k-caption" onClick={() => go({ tab: 'skills' })}>
              Skills ›
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[14px] text-[var(--k-text-2)]">
            {CHAIN_SKILLS.map((s) => (
              <span key={s} data-testid={`loadout-moveset-${s}`}>
                {SKILL_NAME[s]} {carried.includes(s) ? `${slots[s]}/${cap[s]}` : '—'}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx)`
Expected: PASS (5 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 7 tests in F + 1 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx src/features/delve/hub/loadout/EquippedPane.tsx)
git add packages/client/src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx packages/client/src/features/delve/hub/loadout/EquippedPane.tsx
git commit -m "feat(client): the Loadout's equipped pane: paper doll, stats, attunement, moveset" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: The bag pane

The Loadout's bag (`bag-panel`): "Bag n / 40", the filter chips (the Upgrades chip's ▲ in a well), the Sort chip, eight `minmax(56px, 84px)` columns of tiles, and the footer: Equip best, Salvage junk (never a weapon holding runes: `salvageCandidates`) and auto-salvage "up to". A click selects (`onSelect`), a right-click equips (`onEquip`), hover reports `onHover`; under the pad (`inputDeviceStore`), focus selects and A equips. `BagPanel`'s two tests in `ItemDetailSheet.test.tsx` are carried here (Equip best never asks; mid-dive waits); Task 8 removes the originals.

**Files:**
- Create: `packages/client/src/features/delve/hub/loadout/__tests__/BagPane.test.tsx`
- Create: `packages/client/src/features/delve/hub/loadout/BagPane.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/loadout/__tests__/BagPane.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  compareItem,
  defaultMoveset,
  generateItem,
  SeededRNG,
  type GearItem,
  type GearSlot,
  type ManaType,
  type Rarity,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { BagPane } from '../BagPane';
import { getDelveRegistry } from '../../../registry';
import { UPGRADE_EPSILON } from '../../../format';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const gear = (
  uid: string,
  slot: GearSlot,
  rarity: Rarity = 'magic',
  mana: ManaType = 'fire',
): GearItem => generateItem(registry, { uid, ilvl: 3, rarity, slot, mana }, new SeededRNG(4));
const put = (...bag: GearItem[]) => store().setProfile({ ...store().profile, bag });
const open = (locked = false) => {
  const props = { locked, selected: null, onSelect: vi.fn(), onHover: vi.fn(), onEquip: vi.fn() };
  render(<BagPane {...props} />);
  return props;
};
const tiles = () => screen.getAllByTestId('bag-item');
/** The tile of the bag item `uid`, by its name. */
const tile = (uid: string) =>
  tiles().find((t) =>
    t.getAttribute('aria-label')!.startsWith(store().profile.bag.find((i) => i.uid === uid)!.name),
  )!;

describe('the bag pane', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useInputDeviceStore.setState({ device: 'keyboard' });
  });

  it('counts the bag, and marks each tile ▲ better as it is, ◇ better only as a home, NEW', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    // A built-up common sword against a plain uncommon one: worse as it is, better as a home.
    const mine = {
      ...sword,
      moveset: defaultMoveset(registry, sword, 'fire', { primary: 5, basic: 5 }),
    };
    const plain = generateItem(
      registry,
      { uid: 'w2', ilvl: 2, rarity: 'uncommon', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, weapon: mine },
      bag: [gear('h1', 'helm'), plain],
    });
    store().markNew(['h1']);
    open();
    expect(screen.getByTestId('bag-count')).toHaveTextContent(
      `2 / ${registry.getDelveBalance().loot.bagSize}`,
    );
    expect(tile('h1')).toHaveAccessibleName(expect.stringMatching(/, upgrade, new$/));
    expect(tile('w2')).toHaveAccessibleName(expect.stringMatching(/, potential upgrade$/));
    expect(screen.getByTestId('bag-filter-upgrades')).toHaveTextContent('Upgrades 1');
  });

  it('filters by kind and by ▲ upgrades, and sorts by power, rarity, slot or newest', () => {
    put(gear('r1', 'ring', 'common'), gear('w1', 'weapon', 'rare'), gear('h1', 'helm', 'epic'));
    open();
    const rarities = () => tiles().map((t) => t.dataset.rarity);
    fireEvent.click(screen.getByTestId('bag-filter-weapons'));
    expect(rarities()).toEqual(['rare']);
    fireEvent.click(screen.getByTestId('bag-filter-armor'));
    expect(rarities()).toEqual(['epic']);
    fireEvent.click(screen.getByTestId('bag-filter-jewelry'));
    expect(rarities()).toEqual(['common']);
    fireEvent.click(screen.getByTestId('bag-filter-upgrades'));
    expect(tiles().length).toBeGreaterThan(0);
    for (const t of tiles()) expect(t).toHaveAccessibleName(expect.stringContaining(', upgrade'));
    fireEvent.click(screen.getByTestId('bag-filter-all'));
    expect(screen.getByTestId('bag-filter-all')).toHaveAttribute('aria-pressed', 'true');
    const sort = screen.getByTestId('bag-sort');
    expect(sort).toHaveTextContent('Power');
    fireEvent.click(sort);
    expect(sort).toHaveTextContent('Rarity');
    expect(rarities()).toEqual(['epic', 'rare', 'common']);
    fireEvent.click(sort);
    expect(sort).toHaveTextContent('Slot');
    expect(rarities()).toEqual(['rare', 'epic', 'common']); // weapon, helm, ring
    fireEvent.click(sort);
    expect(sort).toHaveTextContent('Newest');
    expect(rarities()).toEqual(['epic', 'rare', 'common']);
  });

  it('hover and a click select, a right-click equips; under the pad focus selects and A equips', () => {
    put(gear('h1', 'helm'));
    const props = open();
    const helm = tiles()[0];
    fireEvent.mouseEnter(helm);
    expect(props.onHover).toHaveBeenLastCalledWith('h1');
    fireEvent.mouseLeave(helm);
    expect(props.onHover).toHaveBeenLastCalledWith(null);
    fireEvent.focus(helm);
    expect(props.onSelect).not.toHaveBeenCalled(); // keyboard focus only moves the ring
    fireEvent.click(helm);
    expect(props.onSelect).toHaveBeenCalledWith('h1');
    fireEvent.contextMenu(helm);
    expect(props.onEquip).toHaveBeenCalledWith('h1');
    useInputDeviceStore.setState({ device: 'gamepad' });
    props.onSelect.mockClear();
    props.onEquip.mockClear();
    fireEvent.focus(helm);
    expect(props.onSelect).toHaveBeenCalledWith('h1');
    fireEvent.click(helm);
    expect(props.onEquip).toHaveBeenCalledWith('h1');
  });

  it('Equip best never asks, and leaves weapons alone', () => {
    const sword = gear('w1', 'weapon', 'rare');
    put(gear('h1', 'helm', 'magic', 'storm'), {
      ...sword,
      moveset: defaultMoveset(registry, sword, 'fire', { primary: 5 }),
    });
    // The sword is an upgrade too, which Equip best still leaves to the compare pane.
    const { equipped, pair } = store().profile;
    expect(
      compareItem(equipped, store().profile.bag[1], registry, 1, pair).powerPct,
    ).toBeGreaterThan(UPGRADE_EPSILON);
    open();
    expect(screen.getByTestId('equip-best')).toHaveTextContent('▲ Equip best (1)');
    fireEvent.click(screen.getByTestId('equip-best'));
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(store().profile.equipped.weapon?.uid).not.toBe('w1');
    expect(store().profile.pair.secondary).toBeNull();
  });

  it('Salvage junk melts what is worse, never a weapon holding runes', () => {
    const p = store().profile;
    const worn = p.equipped.weapon!;
    const chain = worn.moveset!.chains.primary!;
    const runed = [{ ...chain.moves[0], runes: [{ id: 'split', tier: 1 as const }] }];
    const held: GearItem = {
      ...worn,
      uid: 'w2',
      moveset: {
        ...worn.moveset!,
        chains: { ...worn.moveset!.chains, primary: { ...chain, moves: runed } },
      },
    };
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, helm: gear('h0', 'helm', 'epic') },
      bag: [gear('h1', 'helm', 'common'), held],
    });
    open();
    expect(screen.getByTestId('salvage-junk')).toHaveTextContent('Salvage junk (1)');
    fireEvent.click(screen.getByTestId('salvage-junk'));
    expect(store().profile.bag.map((i) => i.uid)).toEqual(['w2']);
  });

  it('auto-salvage takes every rarity up to the one chosen', () => {
    open();
    const chip = screen.getByTestId('auto-salvage');
    expect(chip).toHaveTextContent('Off');
    fireEvent.click(chip);
    const choice = screen.getByRole('radiogroup', { name: 'Auto-salvage up to' });
    fireEvent.click(within(choice).getByTestId('auto-salvage-magic'));
    expect(store().profile.autoSalvage).toMatchObject({
      common: true,
      uncommon: true,
      magic: true,
      rare: false,
      epic: false,
    });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(chip).toHaveTextContent('Magic');
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId('auto-salvage-off'));
    expect(Object.values(store().profile.autoSalvage).some(Boolean)).toBe(false);
  });

  it('locked (mid-dive or paused), Equip best, Salvage junk and auto-salvage wait for the Anvil', () => {
    put(gear('h1', 'helm', 'magic', 'storm'));
    open(true);
    expect(screen.getByTestId('equip-best')).toBeDisabled();
    expect(screen.getByTestId('equip-best')).toHaveTextContent('Equip between dives');
    expect(screen.getByTestId('salvage-junk')).toBeDisabled();
    expect(screen.getByTestId('salvage-junk')).toHaveTextContent('Salvage between dives');
    expect(screen.getByTestId('auto-salvage')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/BagPane.test.tsx)`
Expected: FAIL, no tests: `Failed to resolve import "../BagPane"`.

- [ ] **Step 3: The implementation**

Create `packages/client/src/features/delve/hub/loadout/BagPane.tsx`:

```tsx
import { useMemo, useState, type ReactElement } from 'react';
import {
  EQUIP_BEST_SLOTS,
  GEAR_SLOTS,
  compareItem,
  rarityIndex,
  referenceDepth,
  salvageCandidates,
  type GearItem,
  type GearSlot,
  type Rarity,
} from '@alloy/engine';
import { partsText, useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { Button, Chip, Glyph, Panel, Segmented } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemTile, deltaMark } from '../../ItemTile';
import { RARITY_COLOR, RARITY_LABEL, UPGRADE_EPSILON, formatNumber } from '../../format';

type Filter = 'all' | 'weapons' | 'armor' | 'jewelry' | 'upgrades';
type Sort = 'power' | 'rarity' | 'slot' | 'newest';
type AutoSalvage = Rarity | 'off';

interface Row {
  item: GearItem;
  /** Its place in the bag: newer items come later. */
  index: number;
  /** Power if equipped; a weapon's as a home for your moveset. */
  delta: number;
  /** A weapon's Power if equipped as it is; any other item's `delta`. */
  asIs: number;
}

const KIND: Record<Exclude<Filter, 'all' | 'upgrades'>, readonly GearSlot[]> = {
  weapons: ['weapon'],
  armor: ['helm', 'chest', 'gloves', 'boots'],
  jewelry: ['amulet', 'ring'],
};

const SORTS: { id: Sort; label: string; by: (a: Row, b: Row) => number }[] = [
  { id: 'power', label: 'Power', by: (a, b) => b.delta - a.delta },
  {
    id: 'rarity',
    label: 'Rarity',
    by: (a, b) =>
      rarityIndex(b.item.rarity) - rarityIndex(a.item.rarity) ||
      b.delta - a.delta ||
      b.item.ilvl - a.item.ilvl,
  },
  {
    id: 'slot',
    label: 'Slot',
    by: (a, b) => GEAR_SLOTS.indexOf(a.item.slot) - GEAR_SLOTS.indexOf(b.item.slot),
  },
  { id: 'newest', label: 'Newest', by: (a, b) => b.index - a.index },
];

/** The rarities auto-salvage can take (a legendary never melts by itself). */
const AUTO_RARITIES: Rarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic'];

/**
 * The Loadout's bag: its count, filter and sort chips, eight columns of tiles (▲ better as it
 * is, ◇ better only with your moveset moved onto it, ▼ worse, NEW, the lock), and the footer:
 * Equip best, Salvage junk and auto-salvage. A click selects a tile for the compare pane and a
 * right-click equips it; under the pad, focus selects and A equips (spec, decided item 36).
 */
export function BagPane({
  locked,
  selected,
  onSelect,
  onHover,
  onEquip,
}: {
  /** Mid-dive or paused: Equip best, Salvage junk and auto-salvage wait for the Anvil. */
  locked: boolean;
  selected: string | null;
  onSelect: (uid: string) => void;
  onHover: (uid: string | null) => void;
  onEquip: (uid: string) => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const newUids = useDelveStore((s) => s.newUids);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const bagSize = registry.getDelveBalance().loot.bagSize;
  const { bag, equipped, pair, autoSalvage } = profile;
  const depth = referenceDepth(profile);

  const rows = useMemo<Row[]>(
    () =>
      bag.map((item, index) => {
        const delta = compareItem(equipped, item, registry, depth, pair).powerPct;
        const asIs =
          item.slot === 'weapon'
            ? compareItem(equipped, item, registry, depth, pair, 'asIs').powerPct
            : delta;
        return { item, index, delta, asIs };
      }),
    [bag, equipped, pair, registry, depth],
  );
  const isUp = (r: Row) => deltaMark(r.delta, r.asIs) === 'up';
  const upgrades = rows.filter(isUp).length;
  const shown = rows
    .filter((r) =>
      filter === 'all'
        ? true
        : filter === 'upgrades'
          ? isUp(r)
          : KIND[filter].includes(r.item.slot),
    )
    .sort(SORTS[sort].by);
  // Equip best leaves weapons alone: a weapon changes through the compare pane (Equip or Transfer).
  const best = rows.filter(
    (r) => r.delta > UPGRADE_EPSILON && EQUIP_BEST_SLOTS.includes(r.item.slot),
  ).length;
  const junk = useMemo(() => salvageCandidates(registry, profile, 'magic'), [registry, profile]);
  const upTo: AutoSalvage = [...AUTO_RARITIES].reverse().find((r) => autoSalvage[r]) ?? 'off';

  const onEquipBest = () => {
    const done = useDelveStore.getState().equipBest();
    if (done.length > 0) {
      playSound('orbConfirm');
      vibrate('success');
      showToast(`Equipped ${done.length} upgrade${done.length > 1 ? 's' : ''}`);
    }
  };

  const onSalvageJunk = () => {
    const { scrap, dust, links, runes, destroyed } = useDelveStore.getState().salvage(junk);
    if (scrap > 0) {
      playSound('gemScatter');
      vibrate('medium');
      const dustText = dust > 0 ? ` · +${formatNumber(dust)} Mana Dust` : '';
      const linkText = links > 0 ? ` · +${links} Link${links > 1 ? 's' : ''}` : '';
      const parts = partsText(registry, runes, destroyed);
      showToast(
        `Salvaged ${junk.length} items · +${formatNumber(scrap)} scrap${dustText}${linkText}${parts ? ` · ${parts}` : ''}`,
      );
    }
  };

  const onAutoSalvage = (to: AutoSalvage) => {
    const top = to === 'off' ? -1 : AUTO_RARITIES.indexOf(to);
    AUTO_RARITIES.forEach((r, i) => {
      if (autoSalvage[r] !== i <= top) useDelveStore.getState().setAutoSalvage(r, i <= top);
    });
    setChoosing(false);
  };

  const chip = (id: Filter, label: ReactElement | string) => (
    <Chip pressed={filter === id} onClick={() => setFilter(id)} testId={`bag-filter-${id}`}>
      {label}
    </Chip>
  );

  return (
    <Panel
      scroll={false}
      title={
        <span className="whitespace-nowrap">
          Bag{' '}
          <span
            className={
              bag.length >= bagSize ? 'text-[var(--k-bad-text)]' : 'text-[var(--k-text-3)]'
            }
            data-testid="bag-count"
          >
            {bag.length} / {bagSize}
          </span>
        </span>
      }
      aside={
        <div className="flex flex-wrap items-center gap-2.5">
          {chip('all', 'All')}
          {chip('weapons', 'Weapons')}
          {chip('armor', 'Armor')}
          {chip('jewelry', 'Jewelry')}
          {chip(
            'upgrades',
            <span className="flex items-center gap-1.5">
              <span className="k-well inline-flex px-1 py-0.5">
                <Glyph id="up" size={14} />
              </span>
              Upgrades {upgrades}
            </span>,
          )}
          <span className="k-caption ml-2">Sort</span>
          <Chip
            onClick={() => setSort((sort + 1) % SORTS.length)}
            aria-label={`Sorted by ${SORTS[sort].label}: next sort`}
            testId="bag-sort"
          >
            {SORTS[sort].label}
          </Chip>
        </div>
      }
      testId="bag-panel"
    >
      <div className="k-scroll min-h-0 flex-1">
        {shown.length === 0 ? (
          <p className="k-body-2 py-8 text-center">
            {bag.length === 0
              ? 'Your bag is empty. Monsters in the depths drop gear: go get some.'
              : 'Nothing in your bag fits this filter.'}
          </p>
        ) : (
          <div
            className="grid content-start gap-[14px]"
            style={{ gridTemplateColumns: 'repeat(8, minmax(56px, 84px))' }}
          >
            {shown.map(({ item, delta, asIs }) => (
              <ItemTile
                key={item.uid}
                item={item}
                size={84}
                className="aspect-square h-auto! w-full!"
                delta={delta}
                asIs={asIs}
                isNew={newUids[item.uid]}
                selected={selected === item.uid}
                testId="bag-item"
                onClick={() => {
                  if (useInputDeviceStore.getState().device === 'gamepad') onEquip(item.uid);
                  else {
                    playSound('orbSelect');
                    onSelect(item.uid);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onEquip(item.uid);
                }}
                onFocus={() => {
                  if (useInputDeviceStore.getState().device === 'gamepad') onSelect(item.uid);
                }}
                onMouseEnter={() => onHover(item.uid)}
                onMouseLeave={() => onHover(null)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="go"
          disabled={best === 0 || locked}
          onClick={onEquipBest}
          testId="equip-best"
        >
          {locked ? 'Equip between dives' : `▲ Equip best${best > 0 ? ` (${best})` : ''}`}
        </Button>
        <Button
          disabled={junk.length === 0 || locked}
          onClick={onSalvageJunk}
          testId="salvage-junk"
        >
          {locked
            ? 'Salvage between dives'
            : `Salvage junk${junk.length > 0 ? ` (${junk.length})` : ''}`}
        </Button>
        <span className="k-caption ml-auto">Auto-salvage up to</span>
        <Chip
          pressed={choosing}
          disabled={locked}
          onClick={() => setChoosing(!choosing)}
          testId="auto-salvage"
        >
          {upTo === 'off' ? 'Off' : RARITY_LABEL[upTo]}
        </Chip>
      </div>
      {choosing && (
        <Segmented<AutoSalvage>
          aria-label="Auto-salvage up to"
          value={upTo}
          onChange={onAutoSalvage}
          options={[
            { id: 'off', label: 'Off', testId: 'auto-salvage-off' },
            ...AUTO_RARITIES.map((r) => ({
              id: r,
              label: RARITY_LABEL[r],
              color: RARITY_COLOR[r],
              testId: `auto-salvage-${r}`,
            })),
          ]}
        />
      )}
    </Panel>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/BagPane.test.tsx)`
Expected: PASS (7 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 14 tests in F + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/loadout/__tests__/BagPane.test.tsx src/features/delve/hub/loadout/BagPane.tsx)
git add packages/client/src/features/delve/hub/loadout/__tests__/BagPane.test.tsx packages/client/src/features/delve/hub/loadout/BagPane.tsx
git commit -m "feat(client): the Loadout's bag pane: filters, sort, eight columns, Equip best, Salvage junk, auto-salvage" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The compare pane

### Task 6: The compare pane, with the bind choice inline

The Loadout's right pane (`item-sheet`): the heading, `ItemHeader`, the Power delta (a bag weapon's as it is and as a home), `CompareTable`, `LegendaryBox`, the attunement it moves, the bind choice (`BindChoice`, today's `BindPrompt` content inline, binding and equipping itself), a weapon's Transfer with what it leaves behind, then Equip / Salvage / Lock with their glyphs and gains, Unequip for a worn item, and "Forge it ›". `ItemDetailSheet.test.tsx`'s bind, transfer and valuation assertions are carried here (the sheet keeps its transfer tests for the dive; Task 8 removes its bind tests), and its salvage tests to Task 7, where the armed press lives.

**Files:**
- Create: `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx`
- Create: `packages/client/src/features/delve/hub/loadout/BindChoice.tsx`
- Create: `packages/client/src/features/delve/hub/loadout/ComparePane.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  compareItem,
  defaultMoveset,
  generateItem,
  heroChains,
  referenceDepth,
  SeededRNG,
  type GearItem,
  type ManaType,
  type RuneRef,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { ComparePane } from '../ComparePane';
import { getDelveRegistry } from '../../../registry';
import { UPGRADE_EPSILON, formatDelta } from '../../../format';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const pal = registry.getDelveBalance().pair;
/** A magic helm with only the lines given as affixes. */
const helm = (mana: ManaType, uid = 'h1', affixes: GearItem['affixes'] = []): GearItem => ({
  ...generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'magic', slot: 'helm', mana },
    new SeededRNG(4),
  ),
  affixes,
});
const put = (...bag: GearItem[]) => store().setProfile({ ...store().profile, bag });
/** A rare sword (Basic, Primary and Defensive) with `slots` over its base. */
const rareSword = (uid: string, slots = {}): GearItem => {
  const w = generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire', slots) };
};
/** `w` with its Primary's first move holding `runes`. */
const withRunes = (w: GearItem, runes: (RuneRef | null)[]): GearItem => {
  const moveset = w.moveset!;
  const primary = moveset.chains.primary!;
  const moves = [{ ...primary.moves[0], runes }, ...primary.moves.slice(1)];
  return {
    ...w,
    moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
  };
};
const split = { id: 'split', tier: 3 } as const;
const quick = { id: 'quick', tier: 1 } as const;

/** The pane showing `uid` as selected, and the toasts. */
const show = (uid: string | null, over: Partial<Parameters<typeof ComparePane>[0]> = {}) => {
  const props = {
    uid,
    source: 'selected' as const,
    full: false,
    locked: false,
    armed: null,
    asked: null,
    actions: { equip: vi.fn(), salvage: vi.fn(), lock: vi.fn() },
    go: vi.fn(),
    ...over,
  };
  const view = render(
    <>
      <ComparePane {...props} />
      <ToastContainer />
    </>,
  );
  return { props, unmount: view.unmount };
};
const pane = () => screen.getByTestId('item-sheet');

describe('the compare pane', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null, bindDeclined: [] });
  });

  it('compares a bag item with the worn one: Power, the stat table, the attunement it moves', () => {
    put(helm('fire'));
    show('h1', { source: 'hovered' });
    expect(pane()).toHaveTextContent('Hovered · compared with your helm');
    expect(screen.getByTestId('item-mana')).toHaveTextContent('Fire +1');
    expect(screen.getByTestId('item-compare')).toHaveTextContent('Empty slot: pure gain');
    expect(screen.getByTestId('compare-table')).toBeInTheDocument();
    expect(screen.getByTestId('attune-delta')).toHaveTextContent(
      /^Fire attunement \+1 \(\d+ → \d+\)$/,
    );
    // The seed-4 helm also rolls a shadowAttune line: off the pair, so it attunes nothing.
    expect(screen.getByTestId('attune-delta')).not.toHaveTextContent('Shadow');
    expect(screen.getByTestId('equip-button')).toHaveTextContent(/^Equip · \+\d+% Power/);
  });

  it('shows the worn item itself with its lines, a weapon its moveset, and Unequip', () => {
    const weapon = store().profile.equipped.weapon!;
    show(weapon.uid, { source: 'worn' });
    expect(pane()).toHaveTextContent('Your weapon');
    expect(screen.getByTestId('item-name')).toHaveTextContent(weapon.name);
    expect(screen.queryByTestId('item-compare')).toBeNull();
    expect(screen.getByTestId('item-moveset')).toBeInTheDocument();
    expect(screen.queryByTestId('salvage-button')).toBeNull();
    fireEvent.click(screen.getByTestId('unequip-button'));
    expect(store().profile.equipped.weapon).toBeUndefined();
  });

  it('greys attunement outside the pair, and shows the scrap and Mana Dust salvage gives', () => {
    put(
      helm('frost', 'h1', [
        { stat: 'fireAttune', value: 2, roll: 0.5 },
        { stat: 'frostAttune', value: 2, roll: 0.5 },
      ]),
    );
    store().declineBind('frost');
    show('h1');
    expect(pane()).toHaveTextContent('Selected · compared with your helm');
    expect(screen.getByTestId('item-mana')).toHaveTextContent('not your element');
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      new RegExp(`^Salvage · \\+\\d+ scrap · \\+${pal.salvageDust.magic} Mana Dust`),
    );
  });

  it('Equip, Salvage and Lock act on the item, each with its binding; Forge it opens the Forge with it', () => {
    put(helm('fire'));
    const { props } = show('h1');
    fireEvent.click(screen.getByTestId('equip-button'));
    expect(props.actions.equip).toHaveBeenCalledWith('h1');
    fireEvent.click(screen.getByTestId('salvage-button'));
    expect(props.actions.salvage).toHaveBeenCalledWith('h1');
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('Del');
    fireEvent.click(screen.getByTestId('lock-button'));
    expect(props.actions.lock).toHaveBeenCalledWith('h1');
    expect(screen.getByTestId('lock-button')).toHaveTextContent('Lockkept from salvageL');
    fireEvent.click(screen.getByTestId('forge-it'));
    expect(props.go).toHaveBeenCalledWith({ tab: 'forge', uid: 'h1' });
  });

  it('a locked item says Unlock, and its Salvage waits; an armed one says Press again', () => {
    put({ ...helm('fire'), locked: true }, rareSword('w1'));
    const view = show('h1');
    expect(screen.getByTestId('lock-button')).toHaveTextContent('Unlock');
    expect(screen.getByTestId('salvage-button')).toBeDisabled();
    view.unmount();
    show('w1', { armed: 'w1' });
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(/^Press again to melt/);
  });

  it('gear outside an unbound pair shows the bind choice inline, with the Power either way; Bind binds, then equips', () => {
    put(helm('storm'));
    show('h1');
    const choice = screen.getByTestId('bind-prompt');
    expect(choice).toHaveTextContent('Bind Storm as your second element?');
    expect(screen.getByRole('group', { name: 'Bind Storm' })).toBe(choice);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('bind-prompt-bound')).toHaveTextContent('Power');
    expect(screen.getByTestId('bind-prompt-unbound')).toHaveTextContent('Power');
    // The choice is the equip: no plain Equip beside it.
    expect(screen.queryByTestId('equip-button')).toBeNull();
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(store().profile.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(store().profile.equipped.helm?.uid).toBe('h1');
  });

  it('the bind choice says the chains keep their moves, and binding leaves them alone', () => {
    put(helm('storm'));
    const before = heroChains(registry, store().profile.equipped, store().profile.pair);
    show('h1');
    expect(screen.getByTestId('bind-prompt')).toHaveTextContent(
      'Your moves and blows can use Storm and its gear will attune you; your chains keep the ones they have',
    );
    expect(screen.getByTestId('bind-prompt')).not.toHaveTextContent('last blow');
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(heroChains(registry, store().profile.equipped, store().profile.pair)).toEqual(before);
  });

  it('Not now equips for its stats only, and is remembered per element: Nature still asks after Storm', () => {
    put(helm('storm'), helm('storm', 'h2'), helm('nature', 'h3'));
    let view = show('h1');
    fireEvent.click(screen.getByTestId('bind-prompt-not-now'));
    expect(store().profile.pair.secondary).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    view.unmount();
    view = show('h2');
    expect(screen.queryByTestId('bind-prompt')).toBeNull();
    expect(screen.getByTestId('equip-button')).toBeInTheDocument();
    view.unmount();
    show('h3');
    expect(screen.getByTestId('bind-prompt')).toHaveTextContent(
      'Bind Nature as your second element?',
    );
  });

  it('asked to equip, the bind choice takes the focus on Bind', () => {
    put(helm('storm'));
    show('h1', { asked: 'h1' });
    expect(screen.getByTestId('bind-prompt-confirm')).toHaveFocus();
  });

  it('a refused bind says why and equips nothing', () => {
    put(helm('storm'));
    show('h1');
    vi.spyOn(store(), 'bindSecondary').mockReturnValue({
      ok: false,
      profile: store().profile,
      reason: 'Your second element is already bound',
    });
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(screen.getByText('Your second element is already bound')).toBeInTheDocument();
    expect(store().profile.equipped.helm).toBeUndefined();
  });

  it('a bag weapon is valued as it is and with your moveset; Transfer moves your moveset onto it for scrap', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    const mine = { ...sword, moveset: defaultMoveset(registry, sword, 'fire', { primary: 2 }) };
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, weapon: mine },
      bag: [rareSword('w1', { primary: 2 })],
    });
    show('w1');
    expect(screen.getByTestId('compare-as-is')).toHaveTextContent('Power');
    expect(screen.getByTestId('compare-home')).toHaveTextContent('Power');
    expect(screen.getByTestId('item-compare')).toHaveTextContent(
      'With your moveset · 30 scrap to move it',
    );
    // Your Primary's extra slot moves (30 scrap); the target's own extra Primary slot comes back.
    expect(screen.getByTestId('transfer-button')).toHaveTextContent(
      /Transfer my moveset here · 30 scrap · \+1 Link$/,
    );
    expect(screen.queryByTestId('transfer-leaves')).toBeNull(); // a rare sword carries all of yours
    fireEvent.click(screen.getByTestId('transfer-button'));
    expect(screen.getByText('Not enough scrap')).toBeInTheDocument();
    act(() => store().setProfile({ ...store().profile, scrap: 30 }));
    fireEvent.click(screen.getByTestId('transfer-button'));
    const now = store().profile;
    expect(now.equipped.weapon!.uid).toBe('w1');
    expect(now.equipped.weapon!.moveset!.chains.primary).toEqual(mine.moveset.chains.primary);
    expect(now.equipped.weapon!.moveset!.slots).toMatchObject({ primary: 2, defensive: 1 });
    expect(now.bag.find((i) => i.uid === sword.uid)!.moveset!.slots.primary).toBe(1);
    expect(now).toMatchObject({ scrap: 0, links: 1 });
    expect(screen.getByText(/Your moveset moved onto .+ · \+1 Link$/)).toBeInTheDocument();
  });

  it('each valuation shows its own delta: Equip is marked as it is, Transfer as a home', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    // A built-up common sword against a plain uncommon one: worse as it is, better as a home.
    const mine = {
      ...sword,
      moveset: defaultMoveset(registry, sword, 'fire', { primary: 5, basic: 5 }),
    };
    const plain = generateItem(
      registry,
      { uid: 'w2', ilvl: 2, rarity: 'uncommon', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    const equipped = { ...p.equipped, weapon: mine };
    store().setProfile({ ...p, equipped, bag: [plain] });
    const depth = referenceDepth(store().profile);
    const asIs = compareItem(equipped, plain, registry, depth, p.pair, 'asIs').powerPct;
    const home = compareItem(equipped, plain, registry, depth, p.pair).powerPct;
    expect(asIs).toBeLessThan(-UPGRADE_EPSILON);
    expect(home).toBeGreaterThan(UPGRADE_EPSILON);
    show('w2');
    expect(screen.getByTestId('compare-as-is')).toHaveTextContent(`Power▼ ${formatDelta(asIs)}`);
    expect(screen.getByTestId('compare-home')).toHaveTextContent(`Power▲ ${formatDelta(home)}`);
    expect(screen.getByTestId('equip-button')).toHaveTextContent(
      `Equip · ${formatDelta(asIs)} Power`,
    );
    expect(screen.getByTestId('equip-button')).not.toHaveClass('k-go');
    // Four Primary and two basic extra slots move: 6 × 30 scrap.
    expect(screen.getByTestId('transfer-button')).toHaveTextContent(
      /^▲ Transfer my moveset here · 180 scrap$/,
    );
    expect(screen.getByTestId('transfer-button')).toHaveClass('k-go');
  });

  it('Transfer onto a weapon that carries less says which of your chains stay behind', () => {
    const p = store().profile;
    const epic = { ...p.equipped.weapon!, rarity: 'epic' as const };
    const mine = { ...epic, moveset: defaultMoveset(registry, epic, 'fire') };
    const plain = generateItem(
      registry,
      { uid: 'w2', ilvl: 2, rarity: 'common', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    store().setProfile({ ...p, equipped: { ...p.equipped, weapon: mine }, bag: [plain] });
    show('w2');
    expect(screen.getByTestId('transfer-leaves')).toHaveTextContent(
      'Leaves your Defensive and Ultimate behind',
    );
  });

  it('a transfer counts the sockets it moves and names the runes that leave, by the pull rule', () => {
    const p = store().profile;
    // A rare sword's two sockets onto a common one (one a move): Quick has no socket there.
    const worn = withRunes(rareSword('w1'), [split, quick]);
    const common = { ...p.equipped.weapon!, uid: 'w2' };
    store().setProfile({
      ...p,
      scrap: 999,
      equipped: { ...p.equipped, weapon: worn },
      bag: [common],
    });
    show('w2');
    expect(screen.getByTestId('item-compare')).toHaveTextContent(
      'to move it, its 1 socket included',
    );
    expect(screen.getByTestId('transfer-runes')).toHaveTextContent(
      'Destroys Quick I: no socket for it there',
    );
    act(() => store().setUnsocket('pay'));
    expect(screen.getByTestId('transfer-runes')).toHaveTextContent('Quick I back to your pouch');
    act(() => store().setUnsocket('destroy'));
    fireEvent.click(screen.getByTestId('transfer-button'));
    expect(
      screen.getByText(/Your moveset moved onto .+ · \+1 Link · destroys Quick I$/),
    ).toBeInTheDocument();
    expect(store().profile.equipped.weapon!.uid).toBe('w2');
  });

  it("full compare adds a bag item's stat lines and a weapon's moveset", () => {
    put(rareSword('w1'));
    const view = show('w1');
    expect(screen.queryByTestId('item-moveset')).toBeNull();
    view.unmount();
    show('w1', { full: true });
    expect(screen.getByTestId('item-moveset')).toBeInTheDocument();
  });

  it('a legendary whose power rides a skill the weapon lacks says it needs it', () => {
    const boots = generateItem(
      registry,
      { uid: 'b1', ilvl: 3, rarity: 'legendary', slot: 'boots', mana: 'fire' },
      new SeededRNG(4),
    );
    put({ ...boots, legendary: { id: 'nightstalker', value: 30, roll: 0.5 } });
    show('b1');
    expect(screen.getByTestId('legendary-dead')).toHaveTextContent(
      "Needs a Defensive: your weapon doesn't carry one",
    );
  });

  it('locked, Equip, Salvage, Lock, the bind choice, Transfer and Forge it give way to a note', () => {
    put(helm('storm'), rareSword('w1'));
    const view = show('h1', { locked: true });
    expect(screen.getByTestId('equip-locked')).toHaveTextContent(
      'Equip at the Anvil, between dives',
    );
    for (const id of ['equip-button', 'salvage-button', 'lock-button', 'bind-prompt', 'forge-it'])
      expect(screen.queryByTestId(id)).toBeNull();
    view.unmount();
    show('w1', { locked: true });
    expect(screen.queryByTestId('transfer-button')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx)`
Expected: FAIL, no tests: `Failed to resolve import "../ComparePane"`.

- [ ] **Step 3: The implementation**

Create `packages/client/src/features/delve/hub/loadout/BindChoice.tsx`:

```tsx
import { useEffect, useRef, type ReactElement } from 'react';
import {
  bindSecondary,
  equipItem,
  profilePower,
  type DelveProfile,
  type GearItem,
  type ManaType,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Glyph } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { formatNumber, manaStyle } from '../../format';

/**
 * Equipping `item` asks to bind its element first: it is outside the pair, no second element is
 * bound, and "Not now" hasn't been said to that element this session.
 */
export function needsBind(
  profile: DelveProfile,
  declined: readonly ManaType[],
  item: GearItem,
): boolean {
  const { primary, secondary } = profile.pair;
  return !!primary && !secondary && item.mana !== primary && !declined.includes(item.mana);
}

/**
 * The bind choice, inline in the compare pane (it was the BindPrompt modal): bind the item's
 * element and equip it, or equip it for its stats only and not be asked about that element again
 * this session. Shows the Power either way. `ask` (an Equip pressed) gives Bind the focus.
 */
export function BindChoice({ item, ask }: { item: GearItem; ask: boolean }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const root = useRef<HTMLDivElement>(null);
  const st = manaStyle(registry, item.mana);
  const worn = equipItem(registry, profile, item.uid);
  const statsOnly = profilePower(registry, worn);
  const bound = profilePower(registry, bindSecondary(registry, worn, item.mana).profile);

  useEffect(() => {
    if (ask)
      root.current?.querySelector<HTMLElement>('[data-testid="bind-prompt-confirm"]')?.focus();
  }, [ask]);

  const finish = (bind: boolean) => {
    const store = useDelveStore.getState();
    if (bind) {
      const res = store.bindSecondary(item.mana);
      // Refused: say why, and equip nothing.
      if (!res.ok) {
        playSound('combineFail');
        showToast(res.reason ?? 'Cannot bind');
        return;
      }
    } else store.declineBind(item.mana);
    store.equip(item.uid);
    playSound('orbPlace');
    vibrate('medium');
  };

  return (
    <div
      ref={root}
      role="group"
      aria-label={`Bind ${st.name}`}
      className="k-well flex flex-col gap-3 p-3.5"
      data-testid="bind-prompt"
    >
      <div className="k-disp flex items-center gap-2 text-[22px]">
        <Glyph id={item.mana} size={22} color={st.color} /> Bind {st.name} as your second element?
      </div>
      <p className="k-body-2">
        Your moves and blows can use {st.name} and its gear will attune you; your chains keep the
        ones they have (add {st.name} in the chain builder). After that, only a Realign changes it.
      </p>
      <div className="grid grid-cols-2 text-center">
        <div data-testid="bind-prompt-bound">
          <span className="k-label">Bound</span>
          <div className="k-disp text-[22px] text-[var(--k-ok)]">{formatNumber(bound)} Power</div>
        </div>
        <div data-testid="bind-prompt-unbound">
          <span className="k-label">Stats only</span>
          <div className="k-disp text-[22px]">{formatNumber(statsOnly)} Power</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" testId="bind-prompt-confirm" onClick={() => finish(true)}>
          Bind
        </Button>
        <Button testId="bind-prompt-not-now" onClick={() => finish(false)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
```

Create `packages/client/src/features/delve/hub/loadout/ComparePane.tsx`:

```tsx
import { useMemo, type ReactElement } from 'react';
import {
  carriedSkills,
  movesetTransfer,
  profileStats,
  salvageDust,
  salvageValue,
  unsocketMode,
  weaponParts,
  type ManaType,
} from '@alloy/engine';
import { partsText, pullText, runeNames, useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Glyph, Panel, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { useItemComparison } from '../../items/useItemComparison';
import { ItemHeader } from '../../items/ItemHeader';
import { PowerDelta } from '../../items/PowerDelta';
import { CompareTable } from '../../items/CompareTable';
import { ItemStatLines } from '../../items/ItemStatLines';
import { LegendaryBox } from '../../items/LegendaryBox';
import { MovesetView } from '../../items/MovesetView';
import { SKILL_NAME } from '../../chains/chain-text';
import { SLOT_LABEL, UPGRADE_EPSILON, formatDelta, manaStyle } from '../../format';
import type { HubLink } from '../types';
import { BindChoice, needsBind } from './BindChoice';

/** The item actions the Loadout binds to keys too (LoadoutTab owns them). */
export interface LoadoutActions {
  equip: (uid: string) => void;
  salvage: (uid: string) => void;
  lock: (uid: string) => void;
}

/**
 * The Loadout's right pane: the hovered (else selected, else worn) item against what's worn in
 * its slot: its Power change (a bag weapon's as it is and as a home for your moveset), the stat
 * table, the attunement it moves, the bind choice for gear outside the pair, a weapon's moveset
 * Transfer, and Equip, Salvage and Lock with their gains; "Forge it ›" opens the Forge with it.
 * `full` (Shift or LT held) adds its stat lines and a weapon's moveset. Mid-dive or paused, the
 * actions give way to a note.
 */
export function ComparePane({
  uid,
  source,
  full,
  locked,
  armed,
  asked,
  actions,
  go,
}: {
  uid: string | null;
  source: 'hovered' | 'selected' | 'worn';
  full: boolean;
  locked: boolean;
  /** The precious item a first Salvage press armed. */
  armed: string | null;
  /** The item whose Equip asked to bind first. */
  asked: string | null;
  actions: LoadoutActions;
  go: (to: HubLink) => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const declined = useDelveStore((s) => s.bindDeclined);
  const unsocket = useDelveStore((s) => s.unsocket);
  const { equipped, pair } = profile;
  const attunement = useMemo(
    () => profileStats(registry, { equipped, pair }).attunement,
    [registry, equipped, pair],
  );
  const { item, worn, where, cmp, asIs } = useItemComparison(uid);

  if (!item)
    return (
      <Panel testId="item-sheet" aria-label="Compare">
        <p className="k-body-2">Nothing worn yet: hover an item in your bag to compare it.</p>
      </Panel>
    );

  const inBag = where === 'bag';
  const transfer = worn && asIs ? movesetTransfer(registry, worn, item) : null;
  // Your chains the target can't carry stay behind (their extra slots come back as Links).
  const leaves =
    worn && transfer
      ? carriedSkills(registry, worn.rarity).filter(
          (s) => !carriedSkills(registry, item.rarity).includes(s),
        )
      : [];
  // Equip takes a weapon as it is; Transfer is marked by its value as a home.
  const equipCmp = asIs ?? cmp;
  const isUpgrade = !!equipCmp && equipCmp.powerPct > UPGRADE_EPSILON;
  const homeUpgrade = !!transfer && !!cmp && cmp.powerPct > UPGRADE_EPSILON;
  const pull = unsocketMode(registry, unsocket);
  const parts = weaponParts(registry, item);
  const melts = pullText(registry, parts.runes, pull);
  const dust = salvageDust(registry, item, pair);
  const binding = inBag && !locked && needsBind(profile, declined, item);
  const attune = cmp ? (Object.entries(cmp.attunementDelta) as [ManaType, number][]) : [];
  const slot = SLOT_LABEL[item.slot].toLowerCase();
  const heading =
    source === 'worn'
      ? `Your ${slot}`
      : inBag
        ? `${source === 'hovered' ? 'Hovered' : 'Selected'} · compared with your ${slot}`
        : `Equipped · your ${slot}`;

  const onTransfer = () => {
    const res = useDelveStore.getState().transfer(item.uid);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot transfer');
      return;
    }
    playSound('combineMerge');
    vibrate('success');
    const links = res.links ? ` · +${res.links} Link${res.links > 1 ? 's' : ''}` : '';
    const moved = partsText(registry, res.runes, res.destroyed);
    showToast(`Your moveset moved onto ${item.name}${links}${moved ? ` · ${moved}` : ''}`);
  };

  const onUnequip = () => {
    try {
      useDelveStore.getState().unequip(item.slot);
      playSound('orbRemove');
    } catch {
      showToast('Bag is full');
    }
  };

  return (
    <Panel testId="item-sheet" aria-label="Compare">
      <span className="k-label">{heading}</span>
      <div className="flex">
        <ItemHeader item={item} size="lg" />
      </div>

      {cmp && (
        <div className="flex flex-col gap-1" data-testid="item-compare">
          {!cmp.replaced && <span className="k-caption">Empty slot: pure gain</span>}
          {asIs && transfer ? (
            <>
              <span className="k-label">As it is</span>
              <div data-testid="compare-as-is">
                <PowerDelta cmp={asIs} />
              </div>
              <span className="k-label">
                With your moveset · <Price scrap={transfer.scrap} /> to move it
                {transfer.sockets > 0 &&
                  `, its ${transfer.sockets} socket${transfer.sockets === 1 ? '' : 's'} included`}
              </span>
              <div data-testid="compare-home">
                <PowerDelta cmp={cmp} />
              </div>
            </>
          ) : (
            <PowerDelta cmp={cmp} />
          )}
        </div>
      )}
      {cmp && <CompareTable item={item} worn={worn} />}
      {(!cmp || full) && <ItemStatLines item={item} />}
      <LegendaryBox item={item} />
      {item.slot === 'weapon' && (!inBag || full) && <MovesetView item={item} />}

      {attune.length > 0 && (
        <p className="k-body-2 flex flex-wrap gap-x-4" data-testid="attune-delta">
          {attune.map(([m, d]) => {
            const st = manaStyle(registry, m);
            const now = attunement[m];
            return (
              <span key={m} className="inline-flex items-center gap-1.5">
                <Glyph id={m} size={16} color={st.color} />
                {st.name} attunement {d > 0 ? '+' : '−'}
                {Math.abs(d)} ({now} → {now + d})
              </span>
            );
          })}
        </p>
      )}

      {binding && <BindChoice item={item} ask={asked === item.uid} />}

      {transfer && !locked && (
        <div className="flex flex-col gap-1.5">
          <Button
            variant={homeUpgrade ? 'go' : 'secondary'}
            onClick={onTransfer}
            testId="transfer-button"
          >
            {homeUpgrade ? '▲ ' : ''}Transfer my moveset here · <Price scrap={transfer.scrap} />
            {transfer.links > 0 && (
              <>
                {' · '}
                <Price links={transfer.links} signed />
              </>
            )}
          </Button>
          {leaves.length > 0 && (
            <span className="text-[14px] text-[var(--k-hot)]" data-testid="transfer-leaves">
              Leaves your {leaves.map((s) => SKILL_NAME[s]).join(' and ')} behind
            </span>
          )}
          {transfer.runes.length > 0 && (
            <span className="text-[14px] text-[var(--k-hot)]" data-testid="transfer-runes">
              {pull === 'destroy'
                ? `Destroys ${runeNames(registry, transfer.runes)}: no socket for ${transfer.runes.length === 1 ? 'it' : 'them'} there`
                : `${runeNames(registry, transfer.runes)} back to your pouch`}
            </span>
          )}
        </div>
      )}

      {locked ? (
        <p className="k-well p-3 text-[16px] text-[var(--k-hot)]" data-testid="equip-locked">
          Equip at the Anvil, between dives
        </p>
      ) : (
        <div className="mt-auto flex flex-col gap-2.5">
          {!inBag ? (
            <Button onClick={onUnequip} testId="unequip-button">
              Unequip
            </Button>
          ) : (
            !binding && (
              <Button
                variant={isUpgrade ? 'go' : 'secondary'}
                binding={{ mouse: 'rmb', pad: 'a' }}
                onClick={() => actions.equip(item.uid)}
                testId="equip-button"
              >
                Equip{equipCmp && ` · ${formatDelta(equipCmp.powerPct)} Power`}
              </Button>
            )
          )}
          {inBag && (
            <Button
              variant="danger"
              binding={{ key: 'Delete', pad: 'x' }}
              disabled={item.locked}
              onClick={() => actions.salvage(item.uid)}
              testId="salvage-button"
            >
              {armed === item.uid ? (
                `Press again to melt${melts ? ` · ${melts}` : ''}`
              ) : (
                <>
                  Salvage ·{' '}
                  <Price
                    scrap={salvageValue(registry, item)}
                    links={parts.links > 0 ? parts.links : undefined}
                    dust={dust > 0 ? dust : undefined}
                    signed
                  />
                </>
              )}
            </Button>
          )}
          <Button
            binding={{ key: 'KeyL', pad: 'y' }}
            onClick={() => actions.lock(item.uid)}
            testId="lock-button"
          >
            {item.locked ? 'Unlock' : 'Lock'}
            {inBag && <span className="k-caption">kept from salvage</span>}
          </Button>
          <Button
            variant="quiet"
            onClick={() => go({ tab: 'forge', uid: item.uid })}
            testId="forge-it"
          >
            Forge it ›
          </Button>
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx)`
Expected: PASS (17 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 31 tests in F + 3 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx src/features/delve/hub/loadout/BindChoice.tsx src/features/delve/hub/loadout/ComparePane.tsx)
git add packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx packages/client/src/features/delve/hub/loadout/BindChoice.tsx packages/client/src/features/delve/hub/loadout/ComparePane.tsx
git commit -m "feat(client): the Loadout's compare pane, with the bind choice inline" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The tab, the sheet and the old files

### Task 7: `LoadoutTab`: the panes, the selection, the item actions and the prompts

`LoadoutTab(props: HubTabProps)` lays the three panes in the Loadout's columns and owns what they share: the hovered and selected item, Full compare, the armed Salvage (2 s) and the bind ask. Its prompts are set once and act through a ref on the latest target, so the hub's stable `setPrompts` never loops.

**Files:**
- Create: `packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx`
- Create: `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { defaultMoveset, generateItem, SeededRNG, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import type { Prompt } from '../../../kit';
import { LoadoutTab } from '../LoadoutTab';
import type { HubTabProps } from '../../types';
import { getDelveRegistry } from '../../../registry';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const put = (...bag: GearItem[]) => store().setProfile({ ...store().profile, bag });
const gear = (uid: string, slot: 'helm' | 'ring', mana: 'fire' | 'storm' = 'fire') =>
  generateItem(registry, { uid, ilvl: 3, rarity: 'magic', slot, mana }, new SeededRNG(4));
const rareSword = (uid: string, slots = {}): GearItem => {
  const w = generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire', slots) };
};
const open = (over: Partial<HubTabProps> = {}) => {
  const props: HubTabProps = {
    mode: 'anvil',
    setPrompts: vi.fn(),
    setFooterAction: vi.fn(),
    go: vi.fn(),
    ...over,
  };
  const view = render(
    <>
      <LoadoutTab {...props} />
      <ToastContainer />
    </>,
  );
  return { props, unmount: view.unmount };
};
/** The prompts the tab set last. */
const prompts = (p: HubTabProps): Prompt[] => vi.mocked(p.setPrompts).mock.lastCall![0];
const prompt = (p: HubTabProps, id: string) => prompts(p).find((x) => x.id === id)!;
/** The bag tile of item `uid`, by its name. */
const tile = (uid: string) =>
  screen
    .getAllByTestId('bag-item')
    .find((t) =>
      t
        .getAttribute('aria-label')!
        .startsWith(store().profile.bag.find((i) => i.uid === uid)!.name),
    )!;

describe('LoadoutTab', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useDelveStore.setState({ bindDeclined: [] });
  });
  afterEach(() => vi.useRealTimers());

  it("lays out the equipped, bag and compare panes in the Loadout's columns", () => {
    open();
    expect(screen.getByTestId('loadout-tab')).toHaveStyle({
      gridTemplateColumns: '430px minmax(0, 1fr) 470px',
    });
    expect(screen.getByTestId('paper-doll')).toBeInTheDocument();
    expect(screen.getByTestId('bag-panel')).toBeInTheDocument();
  });

  it('the compare pane shows the hovered item, else the selected one, else the how-to on a first save, else the worn weapon', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    open();
    expect(screen.getByTestId('delve-howto')).toBeInTheDocument();
    fireEvent.click(tile('h1'));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    fireEvent.mouseEnter(tile('r1'));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Hovered · compared with your ring');
    fireEvent.mouseLeave(tile('r1'));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    act(() => {
      const p = store().profile;
      store().setProfile({ ...p, bag: [], stats: { ...p.stats, dives: 1 } });
    });
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Your weapon');
    fireEvent.click(screen.getByTestId('slot-weapon'));
    expect(screen.getByTestId('item-sheet')).toHaveTextContent('Equipped · your weapon');
    expect(screen.getByTestId('item-mana')).toHaveTextContent('Fire');
  });

  it('a right-click equips; gear outside the pair asks first, with the focus on Bind', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring', 'storm'));
    open();
    fireEvent.contextMenu(tile('h1'));
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    fireEvent.contextMenu(tile('r1'));
    expect(store().profile.equipped.ring).toBeUndefined();
    expect(screen.getByTestId('bind-prompt-confirm')).toHaveFocus();
  });

  it('sets its prompts (Select, Equip, Full compare, Salvage, Lock), only Select and Full compare when paused, and clears them when it goes', () => {
    const { props, unmount } = open();
    expect(prompts(props).map((x) => [x.label, x.binding])).toEqual([
      ['Select', { mouse: 'click', pad: 'a' }],
      ['Equip', { mouse: 'rmb', pad: 'a' }],
      ['Full compare', { key: ['ShiftLeft', 'ShiftRight'], pad: 'lt', whileHeld: true }],
      ['Salvage', { key: 'Delete', pad: 'x' }],
      ['Lock', { key: 'KeyL', pad: 'y' }],
    ]);
    unmount();
    expect(props.setPrompts).toHaveBeenLastCalledWith([]);
    const paused = open({ mode: 'pause' }).props;
    expect(prompts(paused).map((x) => x.id)).toEqual(['select', 'compare']);
  });

  it('L locks and Del salvages the hovered or selected item, and nothing else', () => {
    put(gear('h1', 'helm'), gear('r1', 'ring'));
    const { props } = open();
    act(() => prompt(props, 'lock').onPress!()); // nothing hovered or selected
    expect(store().profile.bag.some((i) => i.locked)).toBe(false);
    fireEvent.mouseEnter(tile('h1'));
    act(() => prompt(props, 'lock').onPress!());
    expect(store().profile.bag.find((i) => i.uid === 'h1')!.locked).toBe(true);
    act(() => prompt(props, 'salvage').onPress!()); // locked: kept
    expect(store().profile.bag).toHaveLength(2);
    act(() => prompt(props, 'lock').onPress!());
    act(() => prompt(props, 'salvage').onPress!());
    expect(store().profile.bag.map((i) => i.uid)).toEqual(['r1']);
  });

  it("holding Full compare shows every stat line and a weapon's moveset", () => {
    put(rareSword('w1'));
    const { props } = open({ link: { tab: 'loadout', uid: 'w1' } });
    expect(screen.queryByTestId('item-moveset')).toBeNull();
    act(() => prompt(props, 'compare').onHold!(true));
    expect(screen.getByTestId('item-moveset')).toBeInTheDocument();
    act(() => prompt(props, 'compare').onHold!(false));
    expect(screen.queryByTestId('item-moveset')).toBeNull();
  });

  it('a precious item salvages on a second press within 2 s, and says the Links it gave', () => {
    vi.useFakeTimers();
    put(rareSword('w1', { primary: 3 }));
    open({ link: { tab: 'loadout', uid: 'w1' } });
    const salvage = () => fireEvent.click(screen.getByTestId('salvage-button'));
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      /^Salvage · \+2 Links · \+\d+ scrap/,
    );
    salvage();
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('Press again to melt');
    act(() => vi.advanceTimersByTime(2001));
    expect(screen.getByTestId('salvage-button')).not.toHaveTextContent('Press again');
    salvage();
    expect(store().profile.bag).toHaveLength(1);
    salvage();
    expect(store().profile.bag).toHaveLength(0);
    expect(store().profile.links).toBe(2);
    expect(screen.getByText('+2 Links from its extra slots')).toBeInTheDocument();
  });

  it('Salvage asks first for any weapon holding runes, naming what becomes of them by the pull rule', () => {
    useDelveStore.setState({ unsocket: null });
    const p = store().profile;
    const worn = p.equipped.weapon!;
    const chain = worn.moveset!.chains.primary!;
    const runed = [{ ...chain.moves[0], runes: [{ id: 'split', tier: 3 as const }] }];
    const held: GearItem = {
      ...worn,
      uid: 'w2',
      moveset: {
        ...worn.moveset!,
        chains: { ...worn.moveset!.chains, primary: { ...chain, moves: runed } },
      },
    };
    expect(held.rarity).toBe('common');
    store().setProfile({ ...p, bag: [held] });
    open({ link: { tab: 'loadout', uid: 'w2' } });
    fireEvent.click(screen.getByTestId('salvage-button'));
    expect(store().profile.bag).toHaveLength(1);
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      'Press again to melt · destroys Split III',
    );
    act(() => store().setUnsocket('pay'));
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      'Press again to melt · Split III back to your pouch',
    );
    fireEvent.click(screen.getByTestId('salvage-button'));
    expect(store().profile.bag).toHaveLength(0);
    expect(store().profile.runes).toEqual({ split: [0, 0, 1, 0, 0] });
  });

  it('paused, dive finds carry NEW and their actions are notes', () => {
    put(gear('h1', 'helm'));
    store().markNew(['h1']);
    store().startDive(1);
    open({ mode: 'pause', link: { tab: 'loadout', uid: 'h1' } });
    expect(screen.getByTestId('item-sheet')).toHaveTextContent(
      'Selected · compared with your helm',
    );
    expect(screen.getByTestId('equip-locked')).toBeInTheDocument();
    expect(screen.getByTestId('equip-best')).toBeDisabled();
    expect(tile('h1')).toHaveAccessibleName(expect.stringMatching(/, new$/));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx)`
Expected: FAIL, no tests: `Failed to resolve import "../LoadoutTab"`.

- [ ] **Step 3: The implementation**

Create `packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { findItem, isDiveActive, rarityIndex, weaponParts } from '@alloy/engine';
import { partsText, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import type { Prompt } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { HowTo } from '../HowTo';
import type { HubTabProps } from '../types';
import { EquippedPane } from './EquippedPane';
import { BagPane } from './BagPane';
import { ComparePane, type LoadoutActions } from './ComparePane';
import { needsBind } from './BindChoice';

/** A precious item's second Salvage press must come within this. */
const ARMED_MS = 2000;

/**
 * The Anvil's Loadout tab: the equipped pane, the bag and the compare pane, in the spec's
 * 430 / flexible / 470 px columns. The compare pane shows the hovered item, else the selected one
 * (a click, or the pad's focus), else the worn weapon (the how-to, on a first save). The tab's
 * prompts: Select, Equip, Full compare (hold Shift / LT), Salvage (Del / X) and Lock (L / Y),
 * which act on the hovered or selected item. In `mode: 'pause'` the item actions give way to notes.
 */
export function LoadoutTab({ mode, setPrompts, go, link }: HubTabProps): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const locked = mode === 'pause' || isDiveActive(profile);

  const has = (uid: string | null): uid is string => !!uid && !!findItem(profile, uid);
  const target = has(hovered) ? hovered : has(selected) ? selected : null;
  const howTo = !target && profile.stats.dives === 0;

  const select = (uid: string) => {
    setSelected(uid);
    useDelveStore.getState().markSeen([uid]);
  };

  const actions: LoadoutActions = {
    equip: (uid) => {
      const s = useDelveStore.getState();
      const found = findItem(s.profile, uid);
      if (locked || found?.where !== 'bag') return;
      if (needsBind(s.profile, s.bindDeclined, found.item)) {
        // The compare pane asks first: Bind, or Not now.
        select(uid);
        setAsked(uid);
        return;
      }
      s.equip(uid);
      playSound('orbPlace');
      vibrate('medium');
    },
    salvage: (uid) => {
      const s = useDelveStore.getState();
      const found = findItem(s.profile, uid);
      if (locked || found?.where !== 'bag' || found.item.locked) return;
      const { item } = found;
      const precious =
        weaponParts(registry, item).runes.length > 0 ||
        rarityIndex(item.rarity) >= rarityIndex('rare');
      if (precious && armed !== uid) {
        setArmed(uid);
        return;
      }
      setArmed(null);
      const { links, runes, destroyed } = s.salvage([uid]);
      playSound('orbRemove');
      vibrate('light');
      if (links > 0) showToast(`+${links} Link${links > 1 ? 's' : ''} from its extra slots`);
      const parts = partsText(registry, runes, destroyed);
      if (parts) showToast(parts);
    },
    lock: (uid) => {
      if (mode === 'pause') return;
      useDelveStore.getState().toggleLock(uid);
      playSound('buttonClick');
    },
  };
  // The prompts are set once; their keys act through the latest actions and target.
  const latest = useRef({ actions, target });
  latest.current = { actions, target };

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), ARMED_MS);
    return () => window.clearTimeout(t);
  }, [armed]);

  useEffect(() => {
    if (link?.tab === 'loadout' && link.uid) setSelected(link.uid);
  }, [link]);

  useEffect(() => {
    const on = (act: keyof LoadoutActions) => () => {
      const { actions: a, target: uid } = latest.current;
      if (uid) a[act](uid);
    };
    const prompts: Prompt[] = [
      { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
      { id: 'equip', label: 'Equip', binding: { mouse: 'rmb', pad: 'a' } },
      {
        id: 'compare',
        label: 'Full compare',
        binding: { key: ['ShiftLeft', 'ShiftRight'], pad: 'lt', whileHeld: true },
        onHold: setFull,
      },
      {
        id: 'salvage',
        label: 'Salvage',
        binding: { key: 'Delete', pad: 'x' },
        onPress: on('salvage'),
      },
      { id: 'lock', label: 'Lock', binding: { key: 'KeyL', pad: 'y' }, onPress: on('lock') },
    ];
    setPrompts(
      mode === 'pause' ? prompts.filter((p) => p.id === 'select' || p.id === 'compare') : prompts,
    );
    return () => setPrompts([]);
  }, [mode, setPrompts]);

  return (
    <div
      className="grid h-full min-h-0 gap-6 px-8 py-6"
      style={{
        gridTemplateColumns: '430px minmax(0, 1fr) 470px',
        gridTemplateRows: 'minmax(0, 1fr)',
      }}
      data-testid="loadout-tab"
    >
      <EquippedPane selected={selected} onSelect={select} go={go} />
      <BagPane
        locked={locked}
        selected={selected}
        onSelect={select}
        onHover={setHovered}
        onEquip={actions.equip}
      />
      {howTo ? (
        <div className="k-scroll min-h-0">
          <HowTo />
        </div>
      ) : (
        <ComparePane
          uid={target ?? profile.equipped.weapon?.uid ?? null}
          source={!target ? 'worn' : target === hovered ? 'hovered' : 'selected'}
          full={full}
          locked={locked}
          armed={armed}
          asked={asked}
          actions={actions}
          go={go}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx)`
Expected: PASS (9 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 40 tests in F + 4 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx src/features/delve/hub/loadout/LoadoutTab.tsx)
git add packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx
git commit -m "feat(client): LoadoutTab: three panes, its prompts, the selection and the item actions" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: The item sheet equips as it is, and `BindPrompt` goes

The bind choice now lives in the compare pane, so `BindPrompt` goes, and with it the sheet's ask: the sheet is only the dive's after Phase 2 (2·I drops it from the hub), where Equip is locked. Its five bind tests give way to one (Task 6 carries them), and the two `BagPanel` tests leave (Task 5 carries them).

**Files:**
- Modify: `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`
- Modify: `packages/client/src/features/delve/ItemDetailSheet.tsx`
- Delete: `packages/client/src/features/delve/BindPrompt.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`:

Delete the lines:

```tsx
  heroChains,
```

Delete the lines:

```tsx
import { BagPanel } from '../BagPanel';
```

Replace the lines from `it('equipping gear outside the pair asks to bind it, with the Power either way; Bind binds, then equips', () => {` up to (not including) `it('mid-dive Equip, Unequip and Transfer give way to "Equip at the Anvil"', () => {` with:

```tsx
  it('Equip takes gear outside the pair as it is: the bind choice lives in the Loadout', () => {
    put(helm('storm'));
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    expect(screen.queryByTestId('bind-prompt')).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h1');
  });
```

Delete the lines from `it('Equip best never asks, and leaves weapons alone', () => {` up to (not including) `it('mid-dive the Forge tab waits for the dive to end', () => {`.

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: FAIL, 1 failed | 20 passed (21): "Equip takes gear outside the pair as it is…" (`expected <div …> to be null`: the bind prompt opens).

- [ ] **Step 3: The implementation**

In `packages/client/src/features/delve/ItemDetailSheet.tsx`:

Delete the lines:

```tsx
import { BindPrompt } from './BindPrompt';
```

Delete the lines:

```tsx
  const [binding, setBinding] = useState(false);
```

Delete the lines from `// Gear outside the pair while no second element is bound: equipping it asks to bind (between dives).` up to (not including) `// Your moveset would make the weapon an upgrade (Transfer's mark, as Equip's is as it is).`.

Replace:

```tsx
  const onEquip = () => {
    if (unbound && !store().bindDeclined.includes(item.mana)) {
      setBinding(true);
      return;
    }
    store().equip(item.uid);
```

with:

```tsx
  const onEquip = () => {
    store().equip(item.uid);
```

Replace:

```tsx
        aria-label={item.name}
        // The bind prompt holds the keyboard: nothing behind it takes focus or clicks.
        inert={binding}
      >
```

with:

```tsx
        aria-label={item.name}
      >
```

Delete the lines:

```tsx
      {binding && !isEquipped && (
        <BindPrompt
          item={item}
          onDone={() => {
            setBinding(false);
            onClose();
          }}
        />
      )}
```

Delete `packages/client/src/features/delve/BindPrompt.tsx` (`git rm` in the commit block).

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: PASS (21 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 34 tests in F + 4 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2a
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/ItemDetailSheet.tsx)
git rm packages/client/src/features/delve/BindPrompt.tsx
git add packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx packages/client/src/features/delve/ItemDetailSheet.tsx
git commit -m "refactor(client): the item sheet equips as it is; the bind prompt is gone" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9 (at integration): `BagPanel` and `PaperDoll` go

Runs on `ui/p2` (`C:/Projects/alloy-ui-p2`) once 2A is merged and the integrator's `AnvilHub` wiring (X1, or the integrator's own) no longer imports them. No test is added: nothing imports either file then, and `AnvilHub.test.tsx` checks the Loadout through `LoadoutTab`'s ids (`paper-doll`, `bag-panel`, `mana-strip`, `delve-howto`).

**Files:**
- Delete: `packages/client/src/features/delve/BagPanel.tsx`
- Delete: `packages/client/src/features/delve/PaperDoll.tsx`

- [ ] **Step 1: Nothing imports them**

Run: `grep -rn "BagPanel\|PaperDoll" packages/client/src`
Expected: no output. (A line here means the hub still renders the interim Loadout: wire X1 first.)

- [ ] **Step 2: Delete them, then the whole client**

```bash
cd /c/Projects/alloy-ui-p2
git rm packages/client/src/features/delve/BagPanel.tsx packages/client/src/features/delve/PaperDoll.tsx
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

Expected: no type errors; the suite passes with the same count as before the deletion (on the scratch copy: 1038 tests in 127 files, `hub/`'s 60 among them).

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/alloy-ui-p2
git commit -m "refactor(client): BagPanel and PaperDoll give way to the Loadout's panes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

After Task 8 (on `ui/p2-2a`):

```bash
cd /c/Projects/alloy-ui-2a
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
git status --short
```

Expected: no type errors; **N + 34 tests in F + 4 files** pass (1038 in 127 at `807b324`); `git status` clean (eight commits on `ui/p2-2a`). `BindPrompt.tsx` is gone; `BagPanel.tsx` and `PaperDoll.tsx` remain, imported only by `AnvilHub.tsx` until X1. No engine file changed, so no engine run is needed beyond the one build for the junction.

After Task 9 (on `ui/p2`, with X1 and the other areas merged): the client suite and typecheck are green, and the integrator's Delve E2E on `desktop` passes with X2's D02 update (on the scratch copy with X1 alone: 23 of 23).

A manual look (optional, the integrator's gate covers it): at 1920×1080 and 1280×720, with a save holding a bag of mixed gear, hover a bag tile (the compare pane follows), click one (it pins), right-click one (it equips, or an off-pair one asks with the focus on Bind), hover a worn tile (its card beside it, inside the window), hold Shift (the moveset and lines appear), press Del twice on a rare (it melts), and with a pad: D-pad over the bag (each focus shows in the pane), A equips, X salvages, Y locks, LT held shows the full compare.
