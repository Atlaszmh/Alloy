# Delve: controller navigation and guidance polish

Date: 2026-10-04 · Target: v0.64.0, no save change

## Goal

Two things make the Delve's menus and its guided start clunky on a controller, and this fixes both without touching the tutorial's steps, lines or flow:

1. **The D-pad jumps.** Focus leaps across the screen, lands on controls scrolled out of view, and doesn't come back the way it went.
2. **Hesta's guidance is hard to pick out.** The objective is small and sits in a different place on every screen, and the highlight looks exactly like the controller's focus ring.

## Evidence (the baseline to beat)

A scripted pad walked the real screens at 1920×1080 and computed every D-pad move (`pickNext` over the topmost scope's candidates). A move is *irreversible* when pressing a direction and then its opposite doesn't return to the start; a *leap* is a move over 700 px.

| Screen | Stops | Irreversible | Leaps |
|---|---|---|---|
| Loadout | 40 | 54 | 2 |
| Loadout, item selected | 45 | 62 | 0 |
| Skills | 30 | 42 | 1 |
| Forge | 52 | 87 | 21 |
| Temper | 71 | 117 | 34 |
| Codex | 27 | 30 | 4 |
| Quests | 22 | 32 | 23 |
| Settings | 12 | 18 | 0 |

Causes found, each with an example from the run:

- **Direction is centre-based with no cone** (`spatial-nav.ts`: any centre more than 1 px to that side qualifies). Left on the Loadout tab drops into the bag; right on the Cuirass pattern goes up to the Loadout tab (710 px); down from Realign lands on Delve (1,531 px).
- **Clipped controls are candidates.** `visible()` ignores scroll clipping, so the shard bench's chips, scrolled below the Materials pane, are targets from the footer (Delve, down: 835 px), and landing on one scrolls the pane.
- **No panes, no memory.** Focus leaks from the middle of a list into the header or footer, and returning lands elsewhere.
- **Tabs are D-pad stops**, and LB/RB leaves the focus on the tab header.
- **The tutorial takes the focus.** `TutorialHighlight` refocuses its target whenever the target's DOM node changes (a re-render), not once per step; `TutorialPanel` adds its own stops to the hub's scope, and a beat's Continue autofocuses.
- **Highlight ≡ focus ring**: both a 3 px `#fee761` outline (`kit.css`, `TutorialHighlight.tsx`).
- **The objective moves and competes**: bottom-left in the dive (beside a Quests tracker showing a different goal), top-centre at the stop (over the stop's header), bottom-right at the Anvil, 16 px text in a panel like any other.
- **The Anvil panel reflows the hub**: it takes about 250 px of height, so every pane shrinks (the pattern list loses three rows).
- **The highlight stops at the tab**: "Forge an uncommon cuirass" highlights the Forge tab even when it is open; the five clicks inside get no pointer.
- **The stop shows the dive HUD under it**, dimmed, overlapping its own header counts.
- **The marker goes dark behind an open view** (reproduced). The lesson's bind happens in the Skills tab's Mana view, a pad scope of its own that fills the right pane and stays open after the bind. The next step ("Add a slot, set Frost, socket the rune, Apply") names `skills.addSlot`, which lies outside that scope, as does every way to it, so no marker shows; the move inspector, where the element is set, is not on screen; and the pad is held in the Mana view, where only B leaves and LB/RB do nothing.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Where the objective lives | One strip at the top of every screen: the dive, the stop, the Anvil and the Training Grounds |
| How far the marker leads | Every click inside a multi-click step (a `trail` per step) |
| Tabs and footer on the D-pad | The kit's tabs off (LB/RB and LT/RT only); the footer stays, as its own group; the Skills tab's skill list stays a list |
| Where it felt worst | Loadout and bag, the Skills builder, Forge and Temper: verified by hand first |
| Tutorial content | Unchanged: steps, lines, objectives, triggers and gates stay as they are |

## 1. Navigation

All of it lives in `features/gamepad/spatial-nav.ts` (pure geometry) and `use-gamepad-nav.ts` (the DOM), plus attributes the kit sets. No screen gets hand-written neighbour links.

### 1.1 Picking the next control (`pickNext`)

Replaces the centre-based score. For a press in direction `d` from box `from`:

1. **Beyond the edge.** A candidate qualifies only if it lies past `from` in `d`: its far edge is beyond `from`'s far edge and its near edge is beyond `from`'s near edge (so an overlapping neighbour counts, a box behind or around `from` doesn't).
2. **The beam.** Among candidates whose span across `d` overlaps `from`'s span (the beam) the nearest wins, by the gap along `d`, ties to the smaller offset between centres across `d`.
3. **The cone.** A candidate off the beam must lie in a cone: its gap across `d` at most `CONE` (0.5) × the distance between the two centres along `d`. Among those the smallest `along² + (2 × across)²` wins.
4. **Beam against cone.** The beam's pick wins, unless the cone's pick lies wholly in a nearer row (its far edge no further along `d` than the beam pick's near edge) and no further aside than `from` is wide: a ragged, wrapped grid steps row by row.
5. **Else nothing.** At an edge the focus stays put. No wrap.

`pickNext(from, candidates, dir)` keeps its signature and stays pure.

This rule was prototyped in the page and run over the real hub screens before the plan was written (1920×1080, the same save as the evidence). Every stop is reachable on every screen, no move lands on a clipped control, and the moves inside a pane that don't reverse fall to:

| Screen | Before (all moves) | After (inside a pane) |
|---|---|---|
| Loadout | 54 | 12 |
| Loadout, item selected | 62 | 14 |
| Skills | 42 | 4 |
| Forge | 87 | 14 |
| Temper | 117 | 18 |
| Codex | 30 | 0 |
| Quests | 32 | 0 |
| Settings | 18 | 9 |

What remains is ragged layout (a wide control under two columns, a short last row). Moves between panes are made reversible by the memory below.

### 1.2 Groups, with memory

A **group** is the nearest `[data-pad-group]` ancestor. The kit sets it: `Panel` on every plate and glass panel (never a well: a well inside a plate belongs to the plate's group), `Footer`, and `Header`. A control in no group is a group of one.

`moveFocus(dir)`:

1. Pick among the candidates of the focused control's group. If one qualifies, focus it.
2. Else pick among the **other groups' boxes** (those holding a candidate), by the same rule: a pane lying that way is found even when none of its controls lines up with the focused one. The focus enters the picked group at the control it last held (if that is still a candidate), else at the rule's pick among its candidates, else at its candidate nearest the focused control (the gap between the two boxes).

Each scope remembers the last focused control per group (a `WeakMap`, beside today's `lastFocus`). So leaving a pane and later coming back into it, by whatever presses, lands on the control left. (The very next opposite press need not be that return: a remembered control may have a neighbour of its own on that side, inside its group.)

The rule is exported for tests and the audit: `nextFocus(el, dir, { memory })` returns the control a press would focus, with the memory or, `memory: false`, by the picks alone. `moveFocus` focuses what it returns.

`keepFocus` (a focused control vanished) prefers the nearest candidate in the group it was in, else the nearest in the scope, as now.

### 1.3 What counts as a candidate

As now (`FOCUSABLE`, visible, not under `[data-pad-skip]`), and:

- **Not clipped.** A control none of whose box shows inside one of its scroll containers (an ancestor with `overflow` auto or scroll) is a candidate only when the focused control shares its nearest scroll container. The viewport clips nothing: a sheet still sliding in is focused before it arrives, as now. Inside a scrolling list the D-pad still walks to the next row and scrolls it in; from outside, the list's hidden rows don't exist.
- **Not a kit tab.** The kit's `Tabs` puts `data-pad-skip` on its tablist, both levels: the hub's and the pause's top tabs, the Forge's benches, the Codex's sections, the Training dock's tabs and the Lab's views. They stay clickable and keep their LB/RB and LT/RT glyphs. The Skills tab's skill list (`SkillList`, a hand-built `role="tab"` list that is also a pane's content) is **not** skipped: its rows stay D-pad stops in their own group, and LT/RT steps it as now.

### 1.4 Stepping tabs

`stepTabs` clicks the tab as now. Then:

- If the tab is a candidate (the skill list), it takes the focus, as now.
- If it is skipped (a kit tablist) and the focused control survived the switch (the footer's, say), the focus stays.
- Else the focus goes to the first candidate that follows the tablist in document order and is not in the `Footer`: the new tab's first control (the top tabs sit in the header, so that is the main's first; a sub tablist's is its bench's or section's first).

No per-tab memory: the hub's tab views remount on a switch. The Training dock, which today focuses its selected tab when the pad opens it, focuses its first control that is not skipped instead.

### 1.5 The tutorial never takes the focus twice

- The marker (section 2.2) moves the focus to its control **once each time the marked target changes** (a new step, or the trail advancing), keyed on the step, the target's id and the pad scope it was found in (a field and its picker share a target), never on the DOM node. A re-render moves nothing.
- A marked control that is not a candidate (a kit tab) never takes the focus: the marker alone points at it, and the tab row's LB/RB glyphs say how to get there. Nor does one on the dive's HUD (`.delve-hud-zoom`), as now. A marked pane gives the focus to its first candidate.
- The objective strip has no D-pad stops but a beat's Continue (section 2.1). Its mouse-only controls sit under `data-pad-skip`.
- The strip is never a pad scope, as today's panel is not: during a beat the screen's own tabs, prompts and Menu keep working.

## 2. Guidance

### 2.1 The objective strip

`TutorialPanel` becomes one strip at the top of every screen it shows on, with the same parts in the same order: Hesta's portrait (48 px), then the **objective** large (Jersey 10, about 28 px, `--k-hot-hi`) with its input glyphs and, when the step needs more than one, its count; then her **line** at 16 px. All from `tutorialText`, as now. Its test ids stay (`tutorial-panel`, `tutorial-line`, `tutorial-objective`, `tutorial-continue`, `tutorial-skip-step`).

- **The dive and the Training Grounds** (both an arena under `HudGrid`): a new centre slot in `HudGrid` under the top bar, 720 px wide, the line under the objective, above the `BossBar` when a boss lives. Her line shows for 8 s after a step begins and through a beat, then folds away (it stays in the DOM, collapsed), leaving the objective row; a step change brings it back. The `QuestTracker` is hidden while a guided step shows, so one goal is on screen.
- **The stop:** the same strip in the stop's header row, between the title and the counts (720 px, narrower where the row is: 1280×800), the line always shown. It no longer overlaps the power-up row. The `HudGrid` slot shows floor steps only and the stop's strip stop steps only, so one `tutorial-panel` exists at a time.
- **The Anvil:** a full-width row between the header band and the main, about 72 px, the line beside the objective on one or two lines, always shown. It is its own `data-pad-group`. The panes give up that row and nothing else.
- **Step done:** when the step changes the strip holds the finished objective for 700 ms with a tick and a chime, then shows the current step with a pop (Web Animations on the strip's own elements; under reduced motion, no motion and the same hold). The hold is display only: the engine has already moved on, steps that pass during a hold are not replayed (the strip shows the current one when it ends), and a screen change drops it. A count going up pulses the count.
- **A beat:** the strip shows a **Continue** button (after the hold, if one is running). It is a real control and the strip's only D-pad stop. The focus moves to it once, when the step's trail is done and its `highlight`, if it has one, is on screen (so "look at the Contract board" doesn't hand Continue to the pad until the board shows); with neither, at once. It waits while another scope (the system menu, a picker) is topmost, and moves once the strip's scope is. In the dive that is at once, as now. Enter continues, as now. When the beat ends, the focus goes back to the control it was on before Continue, if that is still a candidate.
- **Skip this step:** when `tutorialSkippable` allows it, the strip shows a quiet mouse button (`data-pad-skip`) and the hint "Stuck? Skip this step from the Menu" with the Menu glyph. The pause already has the entry (`pause-skip-step`); the system menu (the Anvil's and the Training Grounds') gains the same one, shown only while the step is skippable.

### 2.2 The marker

`TutorialHighlight` draws a **marker** that can't be read as focus: four corner brackets in white with an ink shadow, 10 design px outside the target, breathing in and out by 4 px, and a bouncing arrow in forge orange (`#feae34`, the kit's `--k-hot`, written out: the marker is portaled to the body, outside `.delve-ui` where the tokens live) pointing at the target from above (from below when there is no room above). The focus ring stays the solid gold outline; both can sit on one control and read as two things. Under reduced motion the brackets and arrow are still.

It follows its target every frame, looks only in the topmost pad scope and never takes the pointer, as now.

### 2.3 Trails: the marker leads every click

A step may name a **trail**, an ordered list of targets; the marker shows the first one still to do.

- **Data:** `TutorialStep.trail?: TutorialTrailTarget[]` in `tutorial.json`, each entry a `TutorialTarget` or `<TutorialTarget>:<key>` (one control among several). The engine only carries and checks it (`TutorialStepSchema`; `tutorialDataProblems`: each entry's target is known, a keyed entry's target is one of the keyed ones below and its key exists in the data, and only Anvil, Training and stop steps have trails). No rule reads it; the bot ignores it.
- **The rule (client, `findMarked`):** walk the trail in order. An entry whose control is on screen and **done**, or disabled, is passed over. The first entry whose control is on screen, enabled and not done is marked. An entry whose control is not on screen is marked by its way (`findWay`, keyed on the entry's target without its key), if a way is on screen; else passed over. With the trail exhausted, or no trail, the step's `highlight` is marked, as today.
- **The way out.** The marker looks only in the topmost pad scope. When neither the trail, a way nor the `highlight` gives it anything there, and that scope is a view or picker inside the screen (a `[data-pad-scope]` nested in another: the Mana view, a rune or shard picker, a stop card's picker), it marks that scope's `[data-pad-back]`, and the focus follows it under the pad as for any marked control. Only for a step that has a trail or a `highlight`: a step that points at nothing marks no way out. So a view left open over the next step's controls always shows how to leave it. Kit dialogs (the system menu, Settings, Controls) and the pause are not nested and get no marker: the player opened those on purpose.
- **Done** is declared by the control: `aria-selected`, `aria-pressed` or `aria-checked` of `"true"`, or `data-tutorial-done`. A chosen chip or row is done with no new code; the others set `data-tutorial-done` from state their component already holds (the table below). The one that needs a lesson's number (Add slot: the Primary's move count) reads the current step's trigger filter through one hook, `useTutorialStep()`.
- **Keyed controls** render `data-tutorial="<target>:<key>"` on each instance; `findTarget` matches the exact string and, among several, takes the first.

The targets a trail uses (new ones marked +; the rest exist):

| Target | Control | Key (checked against) | Done when |
|---|---|---|---|
| + `quests.done` | the journal's first completed, unclaimed row | | selected |
| `quests.claim` | Claim | | never |
| + `forge.pattern:<key>` | a pattern row (today's `forge.pattern` is the whole list: it stays, for `WAY_TO`) | base id (the bases) | selected |
| + `forge.bar:<key>` | a bench metal choice | metal id (`crafting.json`) | chosen |
| + `forge.flux:<key>` | a bench flux choice | flux rarity | chosen |
| `forge.shard` | the bench's Lines field; in the shard picker's own scope, the picker | | a line holds a shard, or the hero holds none that fits (the lesson's forge needs none) |
| + `forge.bench` | the Forge tab's Forge sub tab (a way only: the forge entries' way while the Temper bench is open) | | selected |
| `forge.go` | Forge | | never |
| + `forge.refine:<key>` | that bar's Refine | metal id | never |
| + `loadout.bag:<key>` | the bag's first tile of that slot and rarity | `<slot>.<rarity>` | selected |
| `loadout.equip`, `loadout.salvage`, `loadout.transfer` | the compare pane's buttons | | never |
| `mana.bind` | the bind choices | | a choice awaits its confirm |
| + `mana.confirm` | the bind's confirm | | never |
| `skills.primary` | the Primary's row in the skill list | | selected |
| `skills.addSlot` | Add slot | | the draft Primary has the step's `moves` |
| + `skills.card:<key>` | the Primary's first or last move card (a way only, never a trail entry) | `first` or `last` | selected, or its purpose met (the last holds the secondary; the first holds a rune): else the marker would swing between the two cards |
| `skills.elements` | the inspector's element chips, rendered as a target only while the Primary's last move is selected | | the draft Primary's last move holds the secondary |
| `skills.socket` | the first move's sockets (they show only on the selected card) | | the draft Primary's first move has a socket |
| + `skills.rune` | the inspector's socket row, a target only while the Primary's first move is selected; in the rune picker's own scope, the picker | | that socket holds a rune |
| `skills.apply` | Apply | | never |
| `temper.hone` | Hone | | Hone is open |
| + `temper.line` | Hone's lines | | a line is picked |
| + `temper.go` | Hone's confirm | | never |
| + `stop.card:<key>` | a power-up card | a kind of the step's own `stop.kinds` | open or taken |
| + `stop.pick` | the open card's picker | | never |

The trails (the steps keep their `highlight`, which shows once a beat's trail is done):

| Step | Trail |
|---|---|
| `l1-claim`, `l1-claim2`, `l2-claim` | `quests.done` → `quests.claim` |
| `l1-forge` | `forge.pattern:cuirass` → `forge.bar:rusty` → `forge.flux:uncommon` → `forge.shard` → `forge.go` |
| `l1-equip` | `loadout.bag:chest.uncommon` → `loadout.equip` |
| `l1-bind` | `mana.bind` → `mana.confirm` |
| `l1-skills` | `skills.primary` → `skills.addSlot` → `skills.elements` → `skills.socket` → `skills.rune` → `skills.apply` (the cards to select come as ways, below) |
| `l1-salvage` | `loadout.bag:weapon.common` → `loadout.salvage` |
| `l1-refine` | `forge.refine:rusty` |
| `l2-compare` (a beat) | `loadout.bag:weapon.rare`, then its `highlight`, `loadout.compare` |
| `l2-transfer` | `loadout.bag:weapon.rare` → `loadout.transfer` |
| `l2-hone` | `temper.hone` → `temper.line` → `temper.go` |
| `s1-equip`, `s2-move`, `s4-upgrade` | `stop.card:<its kind>` → `stop.pick` |

Every other step keeps its one `highlight` (the stops' road steps too: a guided stop offers only the named roads, and `stop.doors` outlines them).

**Selecting is a way, not a trail entry.** `WAY_TO` gains the new targets' ways (a keyed pattern's is `hub.tab.forge`, and so on), and three of them are move cards: `skills.elements` → `skills.card:last`, and `skills.socket` and `skills.rune` → `skills.card:first`, each then → `skills.primary`. With the wrong move selected the entry's control isn't on screen, so the marker points at the card to select; `findWay` passes over a way that is done (today: a selected tab), by the same done rule. Add slot leaves the selection where it was, and this covers it.

Notes for the plan, from the code as it is: the bench's metal and flux are kit `Segmented` options, which gain a per-option `tutorial` as `Tabs` has; a journal row marks itself open with `aria-current`, so `quests.done` sets `data-tutorial-done`; and under the pad a bag tile is selected as it takes the focus, so a `loadout.bag` entry completes the moment the marker focuses it and the marker moves on to the compare pane's button (TU01 expects that).

Under the pad the focus follows the marker as section 1.5 says, so finishing one click puts the focus on the next.

### 2.4 The stop without the HUD

While the stop is up the dive's `HudGrid` is hidden (`visibility: hidden`, still laid out, so its top and right insets hold as they do today; the dock is already dropped at the stop). Hidden controls are no D-pad candidates and no marker targets (both `visible()` helpers treat them as gone). The stop has its own counts, finds and Menu. The arena stays dimmed behind it.

## 3. Testing

- **Unit (`spatial-nav`):** the edge rule, the beam beating a nearer off-beam box, the cone's limit, a ragged wrapped grid stepping row by row, a far diagonal box never beating the beam, nothing at an edge.
- **Unit (`use-gamepad-nav`, jsdom):** a group keeps the focus while it can; leaving a group and coming back lands on the control left; a clipped control is skipped from outside its list and reached from inside; kit tabs are never D-pad targets and the skill list's rows are; `stepTabs`' three outcomes.
- **Unit (tutorial client):** `findMarked` over a trail (done and disabled passed over, a way for an off-screen entry, keyed targets, the `highlight` after the trail, the way out of a nested scope and none out of a dialog); the marker moves the focus once per marked target, not on a re-render and never onto a skipped control; a beat's Continue takes the focus only by its rule and gives it back; the strip's hold on a step change.
- **Tests that encode today's rules, to change with them** (the plans list each one, among them `TutorialHighlight.test.tsx`, `tutorial-targets.test.tsx`, `HudGrid.test.tsx`, `StopScreen.test.tsx`, `DelveRun.test.tsx` and `DelveTraining.tutorial.test.tsx`): `gamepad/__tests__/use-gamepad-nav.test.ts` ("RB steps the top-level tabs…": where the focus lands), `pages/__tests__/DelveTraining.test.tsx` (the dock's focus on opening), `TutorialPanel.test.tsx`, `GuidedChoice.test.tsx` and `DelveRun.tutorial.test.tsx` (the panel's layout and Continue's focus), and `e2e/delve-gamepad.spec.ts` (`padWalk` and any walk that passes through a kit tab; G06 and G07, which focus the skill list's rows, must pass unchanged).
- **Engine:** the schema and `tutorialDataProblems` accept the shipped trails and refuse an unknown target, an unknown key, a key on an unkeyed target and a trail on a floor step. `tests/delve-tutorial-bot.test.ts` re-run (data changed, play must not).
- **E2E, `e2e/delve-pad-nav.spec.ts`** (runs at 1280×800 and 1920×1080, as every `delve*.spec.ts`): the audit made permanent. On a seeded mid-game save with a filled bag, for each hub tab (Loadout with and without an item selected, Skills, Forge, Temper, Codex, Quests), the system menu and Settings, it imports the page's own module from the dev server and, with each control scrolled into view as focusing it would, asks `nextFocus(el, dir, { memory: false })` for every candidate and direction, and asserts: every stop is reachable from the start; no move lands on a clipped control from outside its list; moves inside a group reverse, but for a per-screen, per-size allowance recorded from the measured result (a ratchet, starting from the table in section 1.1). No distance limit: crossing an empty pane or a long list is a long move and a right one. Then three scripted walks with the fake pad, memory on, over the three worst screens: Loadout (a bag tile → the compare pane → back into the bag on the same tile → the footer → back on the same tile), Skills (a skill row → the move cards → the inspector's chips → back on the same card), Forge and Temper (a pattern → the bench's pickers → the Materials pane → back on the same pattern; LT/RT lands on the bench's first control, not on the sub tab).
- **E2E, `e2e/delve-tutorial.spec.ts`:** TU01 follows the marker where a trail exists (the marked element's `data-tutorial` at each click of `l1-forge`), asserts one objective strip on the dive, the stop and the Anvil, no visible dive HUD under the stop, and a pad pass through one beat (A continues). And the stuck state, on a save seeded at `l1-bind`: after the bind in the Mana view the marker is on the view's Back with the pad's focus on it, and one A later it is on Add slot with the move inspector showing.
- **By hand, first:** Loadout and bag, the Skills builder, Forge and Temper, on a real pad.

## Out of scope

- The tutorial's steps, lines, objectives, triggers, gates and floors.
- The arena's in-fight controls and the in-world beacon.
- A layout redesign of any hub tab; fewer D-pad stops come only from the kit's tabs leaving the D-pad.
- New pad prompts for the footer's start-depth chips or the claim count (they stay D-pad stops in the footer's group).
- Touch and the keyboard's Tab order.

## Phases (for the plan)

1. **Navigation core:** `pickNext`, groups and memory, `nextFocus`, the clipped rule, kit tabs off the D-pad and `stepTabs`, the kit's attributes; unit tests; the audit E2E with its allowances recorded.
2. **Guidance:** the strip in its places, Continue's focus rule, the skip entries, the marker's look, the HUD hidden under the stop; the focus-once rule.
3. **Trails:** the engine's `trail` field, schema and checks; `tutorial.json`'s trails; the keyed and done attributes on the controls; `findMarked`; TU01 following the marker.
4. **Close:** the three hand walks, `CLAUDE.md`, version 0.64.0.

Phases 1 and 2 touch different files but for `TutorialHighlight`'s focus rule (phase 2, built on phase 1's `moveFocus`); phase 3 needs phase 2's marker.
