# Delve pad navigation and guidance · 04: close — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The branch is green end to end, the project guide says what was built, the version is 0.64.0, and the three screens that felt worst have been walked.

**Architecture:** No new code but what a walk turns up. Docs and the version only.

**Tech Stack:** Vitest 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-delve-pad-nav-guidance-design.md` §3 ("By hand, first") and "Phases" 4. Runs after `01-nav-core.md`, `02-guidance.md` and `03-trails.md`.

---

### Task 1: everything green

- [ ] **Step 1: The engine**

```bash
cd /c/Projects/Alloy
(cd packages/engine && npx tsup && npx vitest run)
```

Expected: PASS. `tests/delve-tutorial-bot.test.ts` is among them (slow: several minutes); the trail is data the bot never reads, so its counts are as before.

- [ ] **Step 2: The client**

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

Expected: no type errors; the baseline's tests plus the three plans'.

- [ ] **Step 3: The Delve E2E, both sizes**

```bash
(cd packages/client && npx playwright test --project=desktop --project=desktop-1080)
```

Expected: PASS. D02 (`delve.spec.ts`) may go a depth down on a loaded machine: that is its known behaviour, not a failure. A flake elsewhere is re-run once alone before it is believed.

### Task 2: walk the three worst screens

The audit (PN01 to PN04) proves the map; this checks the feel. With a real pad if one is connected to the machine running the plan; else with the fake pad in a headed browser:

```bash
(cd packages/client && npx playwright test e2e/delve-pad-nav.spec.ts --project=desktop-1080 --headed)
```

- [ ] **Step 1: Loadout and bag.** From the Delve button: up into the bag, across the grid, right into the compare pane and back (the same tile), left into the equipped slots and back, down to the footer and back. Nothing jumps past a pane; the tabs are never focused.
- [ ] **Step 2: Skills.** LT/RT through the skill list; right into the cards, right into the inspector, through kind, form and element chips, down to the sockets; back left to the same card and the same row. Pick a card up with X, carry it, drop it.
- [ ] **Step 3: Forge and Temper.** Down the patterns, A on one, right through metal, flux, element, the lines, Forge; right into Materials, down through bars to the shard bench (the pane scrolls as the focus goes), back left to the bench. RT to Temper: the focus is in the gear list. Pick an item, right through the ops.
- [ ] **Step 4: The guided start, on a new save with the pad.** Guided start, a mana, Delve. On the floor: one strip at the top, the tracker gone, the line folding away. At the first beat: A continues. At the stop: no HUD behind it, the marker on Equip's card, then its pick. At the Anvil: the marker leads claim, forge (five clicks), equip, bind (and out of the Mana view by its Back), the Primary's build, salvage, refine, claim.
- [ ] **Step 5: Write down anything that still surprised**, with the control it was on and the press. Fix what is a bug of the rules (a test first, in the plan's file it belongs to); leave what is layout for the user to judge, and list it in the report.

### Task 3: the project guide

**Files:**
- Modify: `CLAUDE.md` (repo root)

Keep the guide's voice (dense, one paragraph per subsystem, file names and exports named). Change exactly these places:

- [ ] **Step 1: "Controller" paragraph.** Where it describes the menu layer ("the D-pad or a left-stick flick moves the focus by position, never onto a `[data-pad-skip]` control…"), replace the "by position" clause with the rule: `nextFocus` in `use-gamepad-nav.ts` picks with `pickNext` (`spatial-nav.ts`: beyond the edge, the beam, then a cone of `CONE`, a nearer row winning in a ragged grid, nothing at an edge) inside the focused control's `[data-pad-group]` (the kit's `Panel` plates and glass, `Header`, `Footer`; a control in none is a group of one) while one lies that way, else into the group whose box lies that way, at the control it last held; a control scrolled out of its list is a candidate only from inside that list (`candidates(active)`); the kit's `Tabs` are `data-pad-skip` (LB/RB and LT/RT only) and a stepped tab puts the focus in the content (`stepTabs`), while the Skills tab's skill list stays a list of stops. Name `e2e/delve-pad-nav.spec.ts` (PN01 the audit with its per-screen allowances, PN02 to PN04 the walks).
- [ ] **Step 2: "Guided start" paragraph, "The client".** Replace the `TutorialPanel` and `TutorialHighlight` descriptions with what plans 02 and 03 built: the objective strip and its places (the `HudGrid`'s centre slot in the dive and the Training Grounds, the stop's header row, a row under the Anvil's band), the line's fold, the hold on a step change, Continue's focus rule, the skip entries; the marker's look and its focus-once rule; `tutorial/marked.ts` (`findMarked`: the trail, done, a way, the `highlight`, the way out of a nested scope); `TutorialStep.trail` and the keyed targets; the dive HUD hidden under the stop. Take each name from the code as merged, not from this plan.
- [ ] **Step 3: "Guided start" paragraph, the script.** Where it lists a step's fields, add `trail?` and one sentence: the engine carries and checks it (`tutorialDataProblems`), no rule reads it.
- [ ] **Step 4: Check it against the code.** For every export, file and attribute the new text names, `grep` it: each must exist as written.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md for the pad navigation and the guidance (v0.64.0)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: the version

**Files:**
- Modify: `packages/client/package.json`

- [ ] **Step 1: Bump it**

```json
// old
  "version": "0.63.0",
// new
  "version": "0.64.0",
```

- [ ] **Step 2: The tests that read it still pass**

Run: `(cd packages/client && npx vitest run -t version)`
Expected: PASS (the title screen and Settings import the version; none pins the number. If one does, update it).

- [ ] **Step 3: Commit**

```bash
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.64.0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: report

- [ ] **Step 1:** `git log --oneline da69a3b0..HEAD` and `git status --short`: every commit of the four plans, a clean tree.
- [ ] **Step 2:** Report to the user: what was built, the audit's final per-screen numbers at both sizes against the spec's "before" table, what the hand walks found and what was left for their judgement, and that nothing was pushed or merged. Stop there.
