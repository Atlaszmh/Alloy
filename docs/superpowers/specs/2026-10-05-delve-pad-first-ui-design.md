# Delve: pad-first UI

Date: 2026-10-05 · Targets: v0.65.0 (phase 1) to v0.69.0 (phase 5), no save change

## Goal

The Delve's menus work on a controller since v0.64.0, but they are mouse layouts walked by a D-pad: three equal panes of 25 to 40 stops, face buttons that change meaning from tab to tab, most text at 14 to 16 px, and screens that ask for two decisions at once. This revamp makes every screen pad-first without taking anything from the mouse and keys: one button grammar, list-and-detail layouts, one decision a screen, a lean HUD, larger text, and the options a couch or Deck player expects.

The review behind it, with a mockup of every screen: https://claude.ai/artifact/Fn51vaSuYBx7e2S6ZbXknV (private to the owner).

## Evidence (the baseline to beat)

A scripted pad on the pad-nav spec's seeded mid-game save, at 1920×1080 (v0.64.1):

| Screen | D-pad stops on screen | Target |
|---|---|---|
| Loadout (12 bag items) | 35 | about 21 |
| Skills, a move selected | 25 | about 10 |
| Forge, a pattern open | 26 | about 14 |
| Temper | 25 | about 15 |
| Quests | 14 | 14 (no cross-pane trip to claim) |
| The stop | 7 | 3 or 4 a step |
| Pause | 32 | 7 |

Text: at 1920×1080 the smallest text is 14 px and 69–92% of a hub tab's text is under 18 px; at 1280×800 (UI scale 0.75) it is 11–12 px. Settings has no text size.

Buttons today: Y is Lock (Loadout), Remove on a tap and Apply on a hold (Skills), Track (Quests), Inspect (the stop); X is Salvage, Reorder, Reroll, Skip; Menu starts a dive at the Anvil and pauses in one; B is labelled "Menu" at the hub's root; the Loadout's footer shows A twice.

## Decisions

Approved by the user (2026-10-05):

| Question | Decision |
|---|---|
| Menu at the Anvil | Menu never starts a dive: it opens the system menu. View opens a Depart sheet whose Delve is focused (View, A to go again) |
| Salvage | A tap of X, with a 5-second Undo; no hold, no confirm |
| The stop | Two steps: the power-up, then the road |
| The HUD | A lean HUD and today's full one, as a setting |
| Materials | A third bench on the Forge tab (Forge, Temper, Materials) |

Taken on the user's behalf (flag on review):

- **Lean is the default HUD**; Full stays a setting. (The approved line read either way.)
- **Claim all is a button**, the journal's first control when two or more wait, not a Y shortcut: Y stays Track on Quests.
- **Undo is on B** (phase 3): putting it on X would make a second salvage undo the first.
- **The stop's finds open with A** on their summary line, not Y (phase 2).
- **The Depart sheet serves the mouse and keys too**: Delve is two clicks, or Enter twice. T still goes to Training.
- **B does nothing at the hub's root.** Esc and Menu open the system menu.
- **Lists wrap only at a true edge** (a dialog's list), never inside a hub pane, where down from the last row still reaches the footer.
- **Text size is the last phase**: larger text needs the roomier layouts of phases 3 and 4.
- **From Diablo IV** (the review's second pass): a review sheet before Salvage junk, Try in Training for an unapplied build, D-pad up as a peek over the lean HUD, swap sticks, and a distinct sound for an upgrade and for an essence.

## 1. The grammar

One job a button, on every Delve screen outside the fight. Each phase brings its screens onto it; phase 1 puts it in the kit.

| Button | Means | Examples |
|---|---|---|
| A | The main thing with what is focused | Equip, edit a move, forge, claim, take |
| X | Take it away | Salvage, remove a move, skip the power-up, reroll a contract |
| Y | Keep or commit | Lock, track, apply changes |
| B | Back, and nothing else | Close a sheet or a picker; take back a salvage (phase 3); else nothing at a screen's root |
| LB / RB | The top tabs | As today |
| LT / RT | The level under the tabs | A skill, a bench, a Codex section, the bag's filter |
| Right stick | Scroll the detail pane | Never moves the focus |
| Menu | The system menu; the pause in a dive | Never starts a dive |
| View | The plan | At the Anvil the Depart sheet; in a dive the journal and the build |

Rules:

1. **No menu action needs a hold.** A destructive one gets an Undo, a priced one a sheet that shows its price. (Charging a hold move in the fight is a mechanic, not a menu hold; phase 5 gives it a press-to-toggle option.)
2. **A button never has two meanings by press count or length.** Today's tap-Y Remove and hold-Y Apply goes in phase 4.
3. **Prompts keep one order** in every footer: A, X, Y, LB/RB, LT/RT, the sticks, View, Menu, B. The kit sorts them (2.5).
4. **A combat binding's glyph never labels a menu control.** The Skills list's RB / RT / LB / LT go in phase 4.
5. **A disabled control says why once, beside itself.**
6. **Detail panes are never D-pad stops.** They follow the focus.

## 2. Phase 1: the shell (v0.65.0)

Kit and hub shell only: no tab's panes are rebuilt. Client only.

### 2.1 Menu, View and the Depart sheet

- The hub's `menu` prompt becomes `{ key: 'Escape' (and the configured menu key, when it is another, as the stop's Menu binds it), pad: 'menu' }` with no `padBack`: Menu and Esc open the system menu, and B does nothing at the root (a tab's own B prompts, such as the Loadout's "Back to bag", are untouched). The configured key must be the prompt's own: with no `[data-pad-back]` left in the hub, the runtime's fallback for it would press `[data-pad-menu]`, the Delve button.
- The footer's Delve button no longer starts a dive. It opens the **Depart sheet** (`hub/DepartSheet.tsx`, a kit `Dialog` titled "Depart", `depart-sheet`): on a click, on View (a `depart` prompt bound `{ pad: 'view' }`), and on Enter with nothing focused (it keeps `data-pad-menu`). Its test id becomes `depart-button`; it draws `{ key: 'Enter', pad: 'view' }` (the `depart` prompt is bound, not drawn in the prompt bar: the button is its glyph), keeps `data-tutorial="hub.delve"`, `data-primary-action="delve"` (the responsive probe's), `data-pad-first` and its label ("Delve ▸ depth N", "Resume dive · depth N"), and is never disabled: the sheet says what holds a dive.
- The Skills tab's compact Delve (`ApplyBar`) opens the sheet too: every tab's `onDelve` is "open the sheet". It becomes `depart-button` as well (one on screen at a time: the footer shows the tab's action or its own button), with the same binding and attributes, and is never disabled either. The pause passes its own Resume as `onDelve` and never mounts `ApplyBar`: untouched.
- The sheet, top to bottom:
  1. **Start at** (`start-depths`): the start-depth chips, between dives when there is more than one.
  2. **Tracked**: each tracked quest's name and its first objective still to do (read-only; none: nothing).
  3. **Waiting** (`claim-count`): "n to claim" as a button that closes the sheet and opens Quests, between dives when n > 0.
  4. **What holds the dive**: the unapplied-draft block (`draft-block`: its warning, Apply with the engine's reason, and "Discard changes & delve", absent under a lesson) and the lesson's reason (`lesson-block`), exactly as the footer has them today.
  5. **Delve** (`delve-button`, the primary button, Enter's too while nothing in the sheet is focused, `data-tutorial="hub.delve"`, disabled by a draft or a lesson with the same `aria-describedby`; "Resume dive · depth N" while a dive is open, when nothing holds it and parts 1 and 3 are absent), **Training** (`training-button`, `data-tutorial="hub.training"`, drawing the T key) and the dialog's Back.
- **The sheet's first focus** (the dialog's `data-pad-first`, for every device): Delve when it is enabled; else the draft's Apply when it can apply; else the dialog's Back.
- Delve in the sheet does what the footer's did (`startDive(depth)` unless a dive is active, the sound, the route). Training closes nothing: it navigates.
- T still opens the Training Grounds from the hub (the hub's `training` prompt keeps `KeyT`, without the pad's View), and from the sheet, which binds T itself (a dialog is its own scope, where the hub's prompts are inert).
- The start depth stays the hub's state, so the footer's label and the sheet agree.

### 2.2 The footer

The hub's planks hold the tab's prompts and Menu on the left and, on the right, one button: Delve (`depart-button`), or the tab's own action (Skills). Training, the start depths, the claim count and both blocks leave it for the sheet. `HubFooter` shrinks to that.

### 2.3 Quests: claim where you are

- **Opens on what is ready.** With no link, the open quest is the first complete one, else the first not yet claimed, else the first.
- **The pad lands on it.** The open quest's row carries `data-pad-first`, and `stepTabs` puts the focus on the new tab's `[data-pad-first]` control when it has one (else its first control, as now). So LB/RB into Quests focuses the open row. (A scope with no focus history also starts on its first `[data-pad-first]` in document order: on Quests that is now this row, not the footer's Delve.)
- **A claims on the row.** Under the pad, while no dive is open, pressing the row of the open quest when it is complete claims it (the same `onClaim`); the footer's A prompt reads "Claim" then, "Select" otherwise. Any other press of a row opens it, as now, and so does every press while a dive is open (the pause; the Anvil mid-dive). The Rewards pane's Claim button stays (the mouse, Enter, the guided start's `quests.claim`).
- **After a claim** the next complete quest in the journal's order opens and, under the pad, its row takes the focus: A, A, A claims them in turn. With none left, the claimed quest stays open while it is still in the journal (a quest: under Done, which opens for it); a claimed contract leaves the board, so the first rule picks what opens, and the focus goes where `keepFocus` puts it (the nearest row).
- **Claim all** (`quest-claim-all`): a `go` button in the journal's head while two or more quests wait and no dive is open. While it shows, it carries the tab's `data-pad-first` instead of the open row. It claims each complete quest in the journal's order through the store's `claimQuest`, stops at a refusal, and reports "Claimed n quests: …" (or the refusal) in the status line; then it is gone, and `keepFocus` puts the focus on the nearest row.
- Rows do not open on focus: a press opens, as today (opening marks a quest seen, which passing over it should not).
- Y stays Track and X Reroll: both already fit the grammar.

### 2.4 Lists wrap at a true edge

`moveFocus` wraps when `nextFocus` finds nothing: if the focused control sits in a `[data-pad-wrap]` container and the press is up or down, the focus goes to that container's lowest or topmost candidate. The kit's `Dialog` takes `wrap`, which sets the attribute on the dialog itself, its Back included: the system menu passes it, so its loop is Back, Resume, the entries (in dev builds the chips under them), and round again, both ways. `nextFocus` itself is unchanged, so the pad audit's rules hold. Phase 2's pause list uses the same attribute.

**Straight back.** `moveFocus` also remembers the last move when it crossed panes (`lastCross`): the press that reverses it returns to the control it left, unless a control inside the pane entered lies that way. The footer's one button sits under the right-hand pane, so without this, down from the bag and up again would land in the compare pane. `nextFocus` is unchanged here too.

### 2.5 Prompt order

`kit/prompts.ts` exports `orderPrompts(prompts)`: a stable sort by the pad button's rank (`a, x, y, lb, rb, lt, rt, ls, rs, view, menu, b`; a prompt with no pad button, or one on the D-pad such as the Skills tab's carry, keeps its place after the ranked ones, before B). `PromptBar` draws through it, for every device, so the keys' prompts sit in the same places as the pad's.

### 2.6 The guided start

- `WAY_TO` gains `'hub.training': 'hub.delve'`: while the sheet is shut, the Training step's marker is on the footer's Delve; in the sheet it is on Training.
- Both the footer's button and the sheet's Delve carry `hub.delve`; the marker looks in the topmost scope, so it is on whichever shows.
- The lesson's reason (`lesson-block`) shows in the sheet, not the footer.
- No step, line, trigger or trail changes. `tests/delve-tutorial-bot.test.ts` is untouched (engine).

### 2.7 Testing

- **Unit:** `DepartSheet` (each part's presence by state; Delve starts the dive at the chosen depth and is disabled by a draft and by a lesson; Discard & delve; Training; the claim button opens Quests); `AnvilHub` (Menu / Esc open the system menu, B doesn't; View, Enter and a click open the sheet; T goes to Training); `HubFooter` (one button, or the tab's action); `QuestsTab` (the default open quest; focus opens under the pad; A on an open complete row claims; the next complete one opens; Claim all's presence, order, stop at a refusal, and message); `use-gamepad-nav` (wrap inside `[data-pad-wrap]` at an edge, none without it, none sideways); `prompts` (`orderPrompts`); `marked` (the Training step's way).
- **Tests that encode today's shell, to change with it:** `HubFooter.test.tsx`, `AnvilHub.test.tsx`, `DelveCamp.test.tsx`, `GuidedChoice.test.tsx`, `ApplyBar.test.tsx`, `QuestsTab` tests, and every E2E that clicks `delve-button` from the hub (25 call sites over ten specs) or `training-button` (two): a fixture `startDive(page)` (the footer's button, then the sheet's) and `openTraining(page)` replace them. Two E2Es read what moved into the sheet and must open it first: `delve-quests.spec.ts` (`claim-count`) and `delve-tutorial.spec.ts` (`lesson-block` and Delve's disabled state, twice).
- **E2E:** `delve-pad-nav.spec.ts` PN01 gains the Depart sheet (audited as a screen, allowance recorded) and loses the footer's old stops; a new PN05 walks the pad through Menu (the system menu opens; pressing down from Resume comes back round to Resume, and up from its Back lands on its lowest control) and View → A (a dive starts). `delve-quests.spec.ts` claims by the row with the pad and by Claim all. `delve-tutorial.spec.ts` TU01 passes with the sheet in the way (the bot's test presses Delve through the fixture).
- **Close:** `CLAUDE.md` (the Client and Controller paragraphs), version 0.65.0.

Not in this phase: the title screen's Delve keeps its Menu shortcut (it enters the Anvil; it starts no dive).

## 3. Phase 2: the dive's edges (v0.66.0)

Each item's plan starts by reading its screen's code; what follows is the design to meet.

- **The stop in two steps** (`stop/StopScreen.tsx`, `StopPanel.tsx`, `DoorPane.tsx`). Step 1, "Take one power-up": the cards in one row, A takes (its picker as today), X skips. Step 2, "Choose your road": the doors and Extract in one row, each door's cost and gain on separate lines with wording as well as colour. The finds become one summary line ("26 scrap bounty · 18 materials · 1 rune · ▲ 1 upgrade waiting"), a control above the cards that A opens (today's Y Inspect goes: Y is not "look"). The potion is a control in step 2's row, shown while life is below full and a potion is left. B on step 2 returns to step 1 only while no power-up was taken. A guided stop's `required` power-up holds step 1 as it holds the doors today. The risk line sits under the title on both steps: a guided stop with no power-up (`s3-home`) opens on step 2 and highlights it. The finds line shows on both steps (a stop with no power-up opens on step 2 and would otherwise have no way to its finds).
- **The pause list** (`hub/PauseScreen.tsx`). Menu opens a short wrapping list over the dimmed arena: Resume, Build and quests, Controls, Settings, Restart the floor, Abandon the dive (and the guided start's skip entries), with the dive's state beside it (depth, biome, rooms, what is banked, the death-loss line, the tracked quest). In the fight, View and a Found-log click open the read-only hub on their tab or item; "Build and quests" opens it from the list. In the hub B returns to the list and Menu resumes; in the list Menu and B resume.
- **The lean HUD** (`arena/hud/*`, `uiStore`). Settings → HUD: Lean (the default) or Full (today's). Lean keeps the dock, the vitals, the minimap with the depth and one tracked-objective line under it, the boss bar and the interact plaque; the purse bar and Found log become a **gain feed** (each pickup a line at the top left for a few seconds; notices join it (every toast while the fight is live: `routeToasts`)), and the right column's inset goes (the top row and the vitals keep theirs), so the camera centres on the hero across the screen.
- **The peek.** D-pad up (a new bindable action, `peek`; a key too) toggles an overlay: the large map, the purse with this dive's gains, and the floor's finds. The fight keeps running. Under the full HUD the peek shows the large map only: the purse and the finds are on screen already. It sits in the clear part of the screen, right of the dock: under the lean HUD's corner (so its Map button stays in reach), or left of the full HUD's floor column and under its purse bar.
- **Close:** the pad audit gains the stop's two steps and the pause list; version 0.66.0.

## 4. Phase 3: Loadout and Forge (v0.67.0)

- **Loadout** (`hub/loadout/*`). The bag's filters step on LT/RT (a kit sub `Tabs`), off the D-pad. The compare pane always shows the focused item, a worn one too (its stats and moveset), with one verdict line first ("An upgrade as it comes", "Better only as a home for your moveset", "Worse"); under the pad, tiles show no focus tooltip. Its buttons stay for the mouse but leave the D-pad (the footer's A / X / Y act on the focused tile), which retires the RT "Actions" jump. The right stick scrolls the pane.
- **Salvage with Undo.** X (and Del) salvages the focused item at once; the store keeps the profile from before for 5 seconds and the footer offers "Undo" on B (and Ctrl+Z) meanwhile: B is "back", it has no other job at the Loadout's root, and X stays free to salvage the next item. Any other change to the save ends the offer. The 2-second "press again" arming for precious items goes.
- **Salvage junk** opens a review sheet: each candidate with what it gives, A keeps one back, Y salvages the rest, with the total. The engine's fences are unchanged.
- **How to delve** leaves the Loadout's default pane: a Help entry in the system menu and the pause, and a Codex section, one topic a page.
- **Forge** (`hub/forge/*`). The bench is rows, not chip fields: Metal, Flux and Element are steppers over what the save holds (what it lacks is one line saying where it drops), Lines open the shard picker. The preview pane (no stops) adds the item's Power against what is worn, as a range from `previewForge`'s bands (an engine helper if the client can't compose it). **Materials** becomes a third sub tab: bars, flux, shards and essences as rows with Refine on the row, then the shard bench, the rune pouch and Fuse.
- **Temper**: the six operations as one list, each row its price and, when it can't be done, the reason.
- **Each tab restores its selection** when you come back to it (the pattern, the gear row, the bag tile), held by the hub.
- The guided start's targets and trails for these controls move with them (`forge.bar`, `forge.flux`, `forge.refine`, `loadout.*`, `temper.*`); TU01 follows.
- **Close:** the audit's allowances drop to the new counts; version 0.67.0.

## 5. Phase 4: Skills (v0.68.0)

- The skills step on LT/RT as a strip (Basic, Primary, Defensive, Ultimate; a skill the weapon doesn't carry dimmed with its "carried by" line); the left pane and its combat glyphs go; the mana pair moves into the strip.
- The chain's cards are the home row. A opens the focused move's editor: rows for Kind, Form, Elements, each socket, and Position. Kind, Elements, Position and the chain's Payment are steppers; Form and a socket open a grid of what fits, each option with its line and what it does to the chain's damage. Every change shows in the chain's numbers at once.
- X removes the move; Y opens the **Apply sheet** (each change, the price, what is destroyed; A applies, B returns). No hold. Position replaces the pad's carried reorder (`captureNav` goes if nothing else uses it).
- **Try in Training**: the builder's button loads the draft into the sandbox and returns to the builder with the draft intact.
- The guided start's lesson 1 trail (`skills.*`) is rewritten for the editor; TU01 and the tutorial bot's client path follow.
- **Close:** the audit; version 0.68.0.

## 6. Phase 5: reading and options (v0.69.0)

- **Type floor:** 18 design px for anything read, 16 for labels (from 14), applied through the kit's text classes; the screens rebuilt in phases 3 and 4 are laid out for it.
- **Settings → Text size:** Small, Medium, Large (100, 115, 130%), a multiplier on `--ui-scale` for the menus, separate from HUD scale. Each screen must hold at Large at 1920×1080 and at Medium at 1280×800; the responsive probes check it.
- **Options:** hold moves by press-to-toggle; swap sticks; stick sensitivity; screen-shake, hit-stop and flash strength; a distinct sound for an upgrade and for an essence.
- **Onboarding:** a screen's first visit pulses its main prompt with one line above the footer, gone once the action is done; systems the save hasn't met stay folded (a save with no flux sees one line, not a row).
- **Close:** `CLAUDE.md`, version 0.69.0.

## Measures

Each phase is held by `e2e/delve-pad-nav.spec.ts`: the stop allowances it already ratchets, plus a ceiling on stops per screen (the Evidence table's targets as each screen is rebuilt) and, from phase 3, a press budget for five everyday tasks (equip an upgrade, salvage an item, change a move's element and apply, forge an item, claim a quest), each at most six D-pad presses plus its face buttons.

## Out of scope

- The fight's controls, but the new `peek` action and phase 5's toggles.
- A loot filter, saved loadouts and an action wheel (the review's Diablo IV pass: not needed here).
- The Training dock (44 stops): after phase 4, when the builder it shares has changed.
- Touch.
- Engine rules. The only engine work foreseen is a Power-range helper for the forge preview (phase 3) and guided-start data (targets and trails) as controls move.

## Phases

| Phase | Version | Plan folder |
|---|---|---|
| 1. The shell | 0.65.0 | `docs/superpowers/plans/2026-10-05-delve-pad-first-ui/` (`00` to `04`) |
| 2. The dive's edges | 0.66.0 | `docs/superpowers/plans/2026-10-05-delve-pad-first-ui-p2/` (`00` to `05`) |
| 3. Loadout and Forge | 0.67.0 | |
| 4. Skills | 0.68.0 | |
| 5. Reading and options | 0.69.0 | |

Each phase is its own branch from `padui/main`, ends green (types, unit tests, the Delve E2E at both sizes) and merges back before the next starts.
