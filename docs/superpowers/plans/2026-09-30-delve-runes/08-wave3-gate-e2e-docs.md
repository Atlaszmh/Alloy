# Delve Runes, Wave 3: the Gate, the E2E, the Docs and the Version

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close stage 4b. Measure the runes against the spec's "Balance and gates" (the DPS Lab's no-rune grid identical; every single rune at most 2.0× its `none` row and every three-rune set at most 3.0×, on one dummy and on the pack; every pacing rail holding with the autopilot using runes), and **stop for the user's call if a ceiling or a rail breaks**; then the Delve E2E for runes on all four devices, `CLAUDE.md`'s Runes bullet and the retired 4a pricing wording, the runes spec's measured status line, and v0.51.0 with the full verification.

**Architecture:** Nothing in `src/` changes unless the gate fails and the user picks new numbers. The gate runs on a measuring build of the engine (`packages/engine/node_modules/.runes-measure`, ignored by git, next to `zod`) with the 4a scripts wave 0 copied into `<before>` plus two new ones (`rune-gate.mjs`, `rune-use.mjs`, written here). The E2E adds `e2e/delve-runes.spec.ts` (the spec's file: the Anvil's picker and Apply, the HUD pip, the stop's fifth kind, fusing) and one test each in `delve-gamepad.spec.ts` (the picker by pad) and `delve-training.spec.ts` (an unrestricted socket); the saves are seeded from the engine's bundle, so they are version 7 by construction.

**Tech Stack:** TypeScript 5.7, Node 24 (the gate scripts, ES modules), Vitest 3, Playwright, Prettier 3.8.1.

**Spec:** `docs/superpowers/specs/2026-09-30-delve-runes-design.md` at `81b0e31`: "Balance and gates", "Testing" (its E2E line), "Docs and version", and "Build waves → Wave 3".

---

**Base:** the controller's merge of waves 0, 1 (A, B, C) and 2 (D, E, F) on `claude/alloy-loot-gear-system-6upsy5`. This is one area alone in its wave: run it in the main checkout (`C:\Projects\Alloy`), or in a worktree made from that merge (`git worktree add ../alloy-gate -b runes/gate <merge>`, node_modules linked as the overview says; then put the worktree's path in place of `C:\Projects\Alloy` in the dev server block below). It needs everything merged first: the Lab's rune view and `runeComboSetups` (D), the autopilot's rune policy (D), and every client piece the E2E drives (C, E, F).

**Files:**

| File | Change |
|---|---|
| `<before>/rune-gate.mjs` (new, scratchpad) | the single-rune and combo gate over the measuring build |
| `<before>/rune-use.mjs` (new, scratchpad) | what the autopilot holds in sockets and pouch after 12 dives |
| `docs/superpowers/specs/2026-09-30-delve-runes-design.md` | the status line, with the measured numbers (LF, never format) |
| `packages/client/e2e/delve-runes.spec.ts` (new) | R01 the Anvil's picker and Apply, R02 the HUD pip, R03 the stop's fifth kind, R04 fusing |
| `packages/client/e2e/delve-gamepad.spec.ts` | `setup` seeds a socket and a pouch rune; G07 the picker by pad |
| `packages/client/e2e/delve-training.spec.ts` | T02 a free, unrestricted socket in the Training Grounds, and its pip |
| `CLAUDE.md` | the Spec list, the movesets bullet's pricing (per origin), the stop's fifth kind, the DPS Lab's rune view, schema version 7, and a new **Runes** bullet (CRLF, hand-edit, never format) |
| `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md` | a dated note: 4b's per-origin pricing supersedes "matched by identity" (LF, never format) |
| `packages/client/package.json` | version 0.51.0 |
| only if the gate fails and the user picks numbers: `packages/engine/src/data/runes.json`, `packages/engine/src/data/balance.json` (`delve.runes`) | the user's numbers |

`packages/client/e2e/delve.spec.ts` needs no change: none of its tests touches a socket, and Task 2 runs it with the others (the spec: "The other Delve specs pass").

**Cross-area needs** (the selectors and behaviour the E2E drives; if an area's plan named a test id otherwise, the controller maps the name here, in the E2E, which is its only consumer):

- **C, `features/delve/runes/`:**
  - `SocketRow`: each socket a button, `data-testid="socket-<i>"` (0-based), with `data-rune="<id>:<tier>"` while it holds a rune (no attribute when empty); the "+ socket" button `data-testid="socket-open"`.
  - `RunePicker`: its root `data-testid="rune-picker"` (with `data-pad-scope`); each candidate a button `data-testid="rune-pick-<id>"` whose text holds the rune's name, its tier in Roman numerals and `runeText(registry, ref, on).effect`; the close button `data-testid="rune-picker-close"` (`data-pad-back`); **Pull** `data-testid="rune-pull"`, its text `pullText`; the Training Grounds' tier chips `data-testid="rune-tier-<1..5>"`.
  - `RunePouchPanel`: its root `data-testid="rune-pouch"`; each rune and tier held, `data-testid="pouch-<id>-<tier>"` (none for a count of 0); its Fuse button `data-testid="rune-fuse-<id>-<tier>"`.
- **E, wiring:**
  - `ChainEditor` draws each move card's `SocketRow` inside `chain-cards`, at the Anvil and in the Training Grounds.
  - In the Training Grounds "+ socket" (`socket-open`) shows while a move has fewer than 3 sockets, and opens one free. (The spec's `ChainRunes.socketPrice` returns null for free, while `SocketRowProps.nextPrice` null *hides* "+ socket"; E passes a free price, or C shows "+ socket" free. Either way `socket-open` must be there.)
  - Closing a picker (its close button, B, or Escape) puts the focus back on the socket that opened it, as `StopPanel`'s picker does for its card.
  - `StopPanel`'s `RunePick`: each move of the equipped weapon with an empty socket as a group `data-testid="stop-rune-move-<skill>-<index>"` holding that move's `SocketRow`; tapping an empty socket opens the `RunePicker`, and a pick takes the stop. (The card itself is `stop-rune`, from `stop-${kind}`.)
- **F, `ArenaHud.tsx`:** each active rune's dot is `data-testid="rune-pip"` with `data-family="<family>"`, inside its `ability-<slot>` button (and inside `attack-button` for the next blow's).
- **D, `arpg/dps-sim.ts`:** the rune rows' `dims` are `{ rune, on, elements, tier }` with `rune: 'none'` for the baselines, and `runeComboSetups(registry, on)`'s setups carry the same keys (`rune` naming the set), with `on` and `elements` spelled as the grid's rows spell them. `rune-gate.mjs` pairs each row and each set with its `none` row by `on` and `elements`, and stops with "no 'none' row for …" if one is missing.
- **The overview's never-format list:** at `81b0e31`, `packages/engine/src/loot/drops.ts` (B edits it), `loot/smithing.ts` and `arpg/geometry.ts` are not Prettier-clean either, so B must hand-edit `drops.ts` too. And `arpg/abilities/resolve.ts`, `targeting.ts`, `data/loader.ts`, `data/registry.ts` and `types/ability.ts` are CRLF in the working tree: a plain `prettier --check` flags them for their line endings alone and `--write` rewrites them, so every area checks with `npx prettier --end-of-line auto`.

---

**Conventions:** the 4a plan's (`docs/superpowers/plans/2026-09-30-delve-weapon-movesets.md`, its "Conventions", "Commands", "Dev server on 5288" and "E2E scratch config" sections) as the overview amends them. In short:
- **One commit per task** (Task 1 one, the status line; Task 3 one, the docs; Task 4 one, the version); stage by path; the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` as the last `-m`. Don't push, don't merge.
- **Never format** `CLAUDE.md`, the specs, `balance.json`; hand-edit them, keeping each file's line endings (`CLAUDE.md` is CRLF, both specs LF; `file <path>` tells).
- **How the edits read:** "Replace: A with: B", "Replace the lines from `A` up to (not including) `B` with:", "Append at the end of the file:", "Create `f`:". Every anchor below was checked unique at `81b0e31`; no other area edits these files, so they still are at the base.
- **Every command runs from the repo root** in a subshell; every commit block starts with `cd /c/Projects/Alloy`.

**`<before>`** is the scratchpad folder wave 0 filled, `C:\Users\hahnz\AppData\Local\Temp\claude\c--Projects-Alloy\239f61fd-0a16-4600-a17d-7efef362f2cc\scratchpad\runes-before` (Bash: `/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/runes-before`). It holds, from `81b0e31` (v0.50.0): `before-depth10.json`, `pacing-before.txt`, `first-dives-before.txt`, and the scripts `snapshot.mjs`, `identical.mjs`, `pacing.mjs`, `first-dives.mjs`, `items-hash.mjs` (their texts are in the 4a plan's Task 12). The plan author measured the same from `81b0e31`; the files must read:

`pacing-before.txt`:

```text
first dive: 3, 3, 3, 3 (each ≥ 3), mean 3 (3–12)
dive 6 mean 23.5, dive 12 mean 30 (> dive 1 + 5, > dive 6)
frost: dive 1 4, dive 12 29.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 6.5 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 22, 19–32 (allowed 13.2–35.2): fire+frost 21, earth+frost 19, storm+fire 22, frost+storm 21, fire+shadow 22, fire+nature 22, shadow+nature 20, fire+earth 29, storm+earth 22, earth+shadow 22, earth+nature 20, frost+shadow 21, frost+nature 23, storm+shadow 32, storm+nature 29
seconds per floor: 35.03 (8–60)
```

`first-dives-before.txt`:

```text
1 1→3 dead power 1266 | 1→5 dead power 2867
2 1→3 dead power 1352 | 1→7 dead power 3506
3 1→3 dead power 1022 | 1→5 dead power 2087
4 1→3 dead power 1166 | 1→5 dead power 2913
```

`before-depth10.json` holds 9,144 rows (`node snapshot.mjs` printed `runs 9144`), and `items-hash.mjs` printed `291 49e20fb6`. If the folder is missing, remake it from `81b0e31` before Task 1 (Task 1, Step 0).

**Dev server on 5288** and **the E2E scratch config**: exactly the 4a plan's blocks (repeated in Task 2, Step 1).

---

## Chunk 1: The balance gate

### Task 1: Measure the runes against the gate, and stop if a ceiling breaks

No tuning (the spec: "If a ceiling breaks, stop and report the numbers to the user before tuning"). This task builds a measuring copy of the engine (the client's bundle is untouched), checks that a hero without runes plays exactly as v0.50.0 did, measures every rune row and every three-rune set against its `none` row, runs the pacing rails with the autopilot using runes, and records the numbers in the spec's status line. The sim is deterministic, so a rerun gives the same numbers.

**Files:**
- Create: `<before>/rune-gate.mjs`, `<before>/rune-use.mjs` (scratchpad, not the repo)
- Modify: `docs/superpowers/specs/2026-09-30-delve-runes-design.md:3` (LF, never format)

- [ ] **Step 0: The before files**

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/runes-before && ls && cat pacing-before.txt first-dives-before.txt)`
Expected: the five scripts and three files above, `pacing-before.txt` and `first-dives-before.txt` reading as above.

Only if the folder or a file is missing, remake it from `81b0e31` in the scratchpad (never in the repo):

```bash
S=/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
mkdir -p $S/runes-before $S/runes-v050 && git -C C:/Projects/Alloy archive 81b0e31 packages/engine package.json tsconfig.base.json pnpm-workspace.yaml | tar -x -C $S/runes-v050
powershell -NoProfile -Command "New-Item -ItemType Junction -Path '$(cygpath -w $S/runes-v050/packages/engine/node_modules)' -Target 'C:\Projects\Alloy\packages\engine\node_modules' | Out-Null; New-Item -ItemType Junction -Path '$(cygpath -w $S/runes-v050/node_modules)' -Target 'C:\Projects\Alloy\node_modules' | Out-Null"
(cd $S/runes-v050/packages/engine && npx tsup --out-dir node_modules/.runes-v050)
```

(The junction makes `node_modules/.runes-v050` land in the repo's `packages/engine/node_modules`, which git ignores.) Copy any missing script from the 4a plan's Task 12 texts into `$S/runes-before`, then from there: `node snapshot.mjs C:/Projects/Alloy/packages/engine/node_modules/.runes-v050/index.js before-depth10.json`, `node pacing.mjs <that index.js> > pacing-before.txt`, `node first-dives.mjs <that index.js> > first-dives-before.txt`, `node items-hash.mjs <that index.js>`. Each must print or read as above. Then `rm -rf /c/Projects/Alloy/packages/engine/node_modules/.runes-v050`, and remove the junctions with `cmd //c rmdir` on each (never delete through them) before deleting `$S/runes-v050`.

- [ ] **Step 1: The gate's scripts**

Write `rune-gate.mjs` and `rune-use.mjs` into `<before>` from the texts at the end of this task.

- [ ] **Step 2: The measuring build**

Run: `(cd packages/engine && npx tsup --out-dir node_modules/.runes-measure)`
Expected: tsup's "Build success" lines (ESM, CJS and DTS).

- [ ] **Step 3: No runes, no change**

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/runes-before && node snapshot.mjs C:/Projects/Alloy/packages/engine/node_modules/.runes-measure/index.js after-depth10.json)`
Expected: `runs 9544 ms …` (about 15 s): v0.50.0's 9,144 runs plus the rune view's, 200 rows on each layout if D's grid is the spec's (170 rune rows over the forms and weapons each rune fits, and 30 `none` rows: 8 forms and 7 weapons, on Fire and on Fire + Frost). Another count is D's grid, not a failure; note it.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/runes-before && node identical.mjs before-depth10.json after-depth10.json)`
Expected, exactly (the after count is Step 3's first number):

```text
rows 9144 before, 9544 after; differing 0
```

This is the spec's gate "the DPS Lab's existing grid must come out identical". A differing row is listed under it: stop and find out why (a rune knob leaking into a hero without runes) before anything else.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/runes-before && node items-hash.mjs C:/Projects/Alloy/packages/engine/node_modules/.runes-measure/index.js)`
Expected: `291 49e20fb6` (v0.50.0's items with their movesets left out: the socket roll runs after the moveset, from its own fork).

- [ ] **Step 4: The single-rune and combo gate**

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/runes-before && node rune-gate.mjs C:/Projects/Alloy/packages/engine/node_modules/.runes-measure/index.js after-depth10.json gate-after.json | tee gate-after.txt)`
Expected: about a minute; the output has this shape (the numbers are what the gate measures, unknown until it runs):

```text
singles: 340 rows over 30 'none' rows (ceiling 2.0×)
  split      one <x> (<on>), pack <x> (<on>)
  … one line per rune, all 14 …
combos: 5564 runs over 15 forms and weapons, ms … (ceiling 3.0×)
  top 10, one: <set> on <on> <x>; …
  top 10, pack: <set> on <on> <x>; …
  bolt       best one <set> <x>, pack <set> <x>
  … one line per form and weapon …
GATE: PASS (singles over 0, combos over 0)
```

(340 single rows and 5,564 combo runs are the spec's counts: 2,782 three-rune sets over the 8 forms and 7 weapons, on both layouts; D's own counts may differ.) The spec's expectations, as a check that the measure works: Multi-shot on Barrage about 1.29× on the pack, on Volley about 1.44× on one dummy; Saturate and Volatile run on Fire + Frost, so their ratios are above 1.

**If the last line reads `GATE: FAIL`, or any `OVER:` line shows: stop here.** Commit nothing more. Report to the controller, for the user: the whole of `gate-after.txt` (the `OVER:` lines name each breach: the rune or set, where, its element set, the layout and its ratio), and the table of Step 7. Tuning is the user's call (the spec names the levers: a rune's tier numbers in `runes.json`, Chain's fall-off, the knobs' constants); wait for it, then follow "If the user tunes" below.

- [ ] **Step 5: The pacing rails, with the autopilot using runes**

Run: `(cd packages/engine && npx vitest run)`
Expected: every test passes, `tests/delve-pacing.test.ts` included (v0.50.0 had 1427 tests in 78 files; the waves add their own files and tests).

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/runes-before && node pacing.mjs C:/Projects/Alloy/packages/engine/node_modules/.runes-measure/index.js | tee pacing-after.txt)`
Expected (about a minute): seven lines shaped as `pacing-before.txt`, each inside the bounds its parentheses print: each first dive ≥ 3 and their mean 3 to 12; dive 6 and dive 12 means above dive 1 + 5, dive 12 above dive 6; Frost's dive 12 at least its dive 1 + 5; legendaries at dive 12 at least 1 and under 12; the own pair's reaction found; every pair of the sweep inside "allowed"; seconds per floor 8 to 60. Runes add Links (salvaged sockets) and power, so dives may go deeper than v0.50.0's: any line out of its bounds is a broken rail. **Stop, as in Step 4,** and report the line and `pacing-before.txt` beside it.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/runes-before && node first-dives.mjs C:/Projects/Alloy/packages/engine/node_modules/.runes-measure/index.js | tee first-dives-after.txt)`
Expected: four lines shaped as `first-dives-before.txt`. A fresh hero has no sockets, so the first dive can change only through rune drops it banks and a rune stop; record what it reads.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/runes-before && node rune-use.mjs C:/Projects/Alloy/packages/engine/node_modules/.runes-measure/index.js | tee rune-use-after.txt)`
Expected: four lines, `seed N: <rarity> weapon, sockets S, socketed [<rune> <tier>, …], pouch P, depth D, power W`. **At least one seed has a rune socketed** (S > 0 and the list not empty): otherwise the rails ran without the autopilot using runes, and the spec's pacing gate isn't met; stop and report it (it is D's policy or B's drops, not a balance question). The plan author's run of the same script on v0.50.0 read `sockets 0, socketed [], pouch 0` for every seed, at depths 26, 27, 40, 27.

- [ ] **Step 6: Remove the measuring build**

Run: `(rm -rf packages/engine/node_modules/.runes-measure)`

- [ ] **Step 7: The report**

Whether the gate passed or not, report this table to the controller (it relays it to the user), filled from `gate-after.txt`, `pacing-before.txt`, `pacing-after.txt`, `first-dives-*.txt` and `rune-use-after.txt`:

```markdown
| Rune | One dummy: worst ratio (on) | Pack: worst ratio (on) |
|---|---|---|
| Split | … | … |
| … all 14 … | | |

Top combos (ceiling 3.0×): one dummy <set on on ×>, <…>, <…>; pack <…>, <…>, <…>.

| Pacing | Before (v0.50.0) | After (v0.51.0) |
|---|---|---|
| First dives (each ≥ 3; mean 3–12) | 3, 3, 3, 3 (mean 3) | … |
| Dive 6, dive 12 means | 23.5, 30 | … |
| Frost dive 1 → dive 12 | 4 → 29.5 | … |
| Legendaries at dive 12; own pair's reaction | 6.5; 6 of 6 | … |
| The 15-pair sweep at dive 6 | median 22, 19–32 (allowed 13.2–35.2) | … |
| Seconds a floor (8–60) | 35.03 | … |
| Runes socketed at dive 12 (seeds 1–4) | none | … |
```

Then, only if Steps 3–5 all held, go on.

- [ ] **Step 8: The spec's status line**

In `docs/superpowers/specs/2026-09-30-delve-runes-design.md` (LF; never format), fill each `<…>` from the files named, as the 4a spec's status line reads.

Replace:

```markdown
All numbers are starting points for the DPS Lab gate; nothing has been measured yet.
```

with:

```markdown
All numbers are starting points for the DPS Lab gate; the gate's measurements follow this paragraph.
```

Replace:

```markdown
every change is marked **(review)** or **(review 2)**, here and in the index.
```

with:

```markdown
every change is marked **(review)** or **(review 2)**, here and in the index.

**Measured** at the values below, nothing tuned (the DPS Lab at depth 10, one dummy and the pack, one seed; the pacing rails at `tests/delve-pacing.test.ts`'s seeds; v0.50.0 before, v0.51.0 after):
- **No runes, no change.** The grid's 9,144 v0.50.0 rows come out identical, row for row; v0.50.0's items (291, over every rarity and a run of encounter drops) roll the same but for their sockets.
- **Single runes, tier III (ceiling 2.0×), worst ratio on one dummy / on the pack:** Split <x> / <x>, Multi-shot <x> / <x>, Pierce <x> / <x>, Chain <x> / <x>, Widen <x> / <x>, Quick <x> / <x>, Echo <x> / <x>, Heavy <x> / <x>, Saturate <x> / <x>, Linger <x> / <x>, Volatile <x> / <x>, Leech <x> / <x>, Drain <x> / <x>, Guard <x> / <x> (from `gate-after.txt`'s rune lines). The highest is <rune> on <on>, <x>×.
- **Combos (ceiling 3.0×, <N> three-rune sets over the 8 forms and 7 weapons):** the highest on one dummy <set> on <on>, <x>×; on the pack <set> on <on>, <x>× (the two top-10 lines' first entries).
- **Pacing: every rail holds** with the autopilot using runes. First dives 3, 3, 3, 3 → <…>; dive 6 and dive 12 means 23.5, 30 → <…>, <…>; Frost dive 1 → dive 12, 4 → 29.5 before and <…> → <…> after; legendaries at dive 12, 6.5 → <…>; the own pair's reaction 6 of 6 → <…>; the 15-pair sweep at dive 6, median 22 (19–32) → <…> (<…>, allowed <…>); seconds a floor 35.03 → <…>. At dive 12 the four seeds' weapons hold <…> sockets with <…> runes socketed (<the runes>).
```

`<N>` is half of `combos: <runs> runs` (each set runs on both layouts).

- [ ] **Step 9: Commit**

```bash
cd /c/Projects/Alloy
git add docs/superpowers/specs/2026-09-30-delve-runes-design.md
git commit -m "docs: the runes spec's measured gate: the no-rune grid identical, every rune and combo under its ceiling, the pacing rails holding" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**If the user tunes** (only on the user's word, after Step 4's or Step 5's stop): make exactly the changes the user names, in `packages/engine/src/data/runes.json` (a rune's tier rows) or `packages/engine/src/data/balance.json → delve.runes` (hand-edit, never format); run `(cd packages/engine && npx vitest run)` (every test passes; a test that pins a changed number is updated to the user's number, in the same commit); then Steps 2 to 7 again, and commit the data before Step 8:

```bash
cd /c/Projects/Alloy
git add packages/engine/src/data/runes.json packages/engine/src/data/balance.json
git commit -m "balance(engine): runes tuned at the gate: <the user's change, in a few words>" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Step 8's line then says "tuned at the gate: <the change>" in place of "nothing tuned", and keeps the first run's breach beside the final numbers ("Echo on Maelstrom 2.31× → 1.86×").

**The scripts** (in `<before>`):

`rune-gate.mjs`:

```js
// The runes spec's DPS Lab gate, at depth 10 on one dummy and on the pack:
// - singles: each 'rune' row of the grid (snapshot.mjs) ÷ its 'none' row (same `on`, same
//   elements) must be at most 2.0;
// - combos: each three-rune set of runeComboSetups (tier III, every move or blow socketed) ÷
//   the same 'none' row must be at most 3.0.
// Prints each rune's worst ratio, the top combos and the verdict; writes every ratio to <out.json>.
// Usage: node rune-gate.mjs <engine dist/index.js> <grid.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const E = await import(pathToFileURL(process.argv[2]).href);
const reg = E.createDefaultRegistry();
const grid = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const SINGLE = 2.0;
const COMBO = 3.0;
const PACKS = [false, true];
const where = (pack) => (pack ? 'pack' : 'one');

// The baselines: every 'none' row, by layout, `on` and element set.
const base = new Map();
const rows = Object.entries(grid).filter(([, r]) => r.view === 'rune');
for (const [k, r] of rows)
  if (r.dims.rune === 'none') base.set(`${k.split('|')[1]}|${r.dims.on}|${r.dims.elements}`, r.dps);
const ratioOf = (pack, dims, dps) => {
  const b = base.get(`${pack}|${dims.on}|${dims.elements}`);
  if (b === undefined) throw new Error(`no 'none' row for ${dims.on} ${dims.elements} (${where(pack)})`);
  return b > 0 ? dps / b : dps > 0 ? Infinity : 1;
};
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'inf');

// Singles, from the grid.
const singles = [];
for (const [k, r] of rows) {
  if (r.dims.rune === 'none') continue;
  const pack = k.split('|')[1] === 'true';
  singles.push({ rune: r.dims.rune, on: r.dims.on, elements: r.dims.elements, pack, ratio: ratioOf(pack, r.dims, r.dps) });
}
const runeIds = reg.getRunes().map((d) => d.id);
console.log(`singles: ${singles.length} rows over ${base.size} 'none' rows (ceiling ${SINGLE.toFixed(1)}×)`);
for (const id of runeIds) {
  const worst = (pack) =>
    singles.filter((s) => s.rune === id && s.pack === pack).reduce((a, s) => (!a || s.ratio > a.ratio ? s : a), null);
  const [one, pk] = PACKS.map(worst);
  if (!one || !pk) throw new Error(`no rows for ${id}`);
  console.log(`  ${id.padEnd(10)} one ${fmt(one.ratio)} (${one.on}), pack ${fmt(pk.ratio)} (${pk.on})`);
}
const singlesOver = singles.filter((s) => s.ratio > SINGLE);
for (const s of singlesOver) console.log(`  OVER: ${s.rune} on ${s.on} (${s.elements}, ${where(s.pack)}) ${fmt(s.ratio)}`);

// Combos, run here: every `on` the grid's rune rows name.
const ons = [...new Set(rows.map(([, r]) => r.dims.on))];
const combos = [];
const t0 = performance.now();
for (const on of ons)
  for (const setup of E.runeComboSetups(reg, on))
    for (const pack of PACKS) {
      const r = E.simulateDps(reg, setup, { depth: 10, pack });
      combos.push({ set: setup.dims.rune, on, elements: setup.dims.elements, pack, ratio: ratioOf(pack, setup.dims, +r.dps.toFixed(2)) });
    }
console.log(`combos: ${combos.length} runs over ${ons.length} forms and weapons, ms ${Math.round(performance.now() - t0)} (ceiling ${COMBO.toFixed(1)}×)`);
for (const pack of PACKS) {
  const top = combos.filter((c) => c.pack === pack).sort((a, b) => b.ratio - a.ratio).slice(0, 10);
  console.log(`  top 10, ${where(pack)}: ${top.map((c) => `${c.set} on ${c.on} ${fmt(c.ratio)}`).join('; ')}`);
}
for (const on of ons) {
  const best = (pack) => combos.filter((c) => c.on === on && c.pack === pack).reduce((a, c) => (!a || c.ratio > a.ratio ? c : a), null);
  const [one, pk] = PACKS.map(best);
  console.log(`  ${on.padEnd(10)} best one ${one.set} ${fmt(one.ratio)}, pack ${pk.set} ${fmt(pk.ratio)}`);
}
const combosOver = combos.filter((c) => c.ratio > COMBO);
for (const c of combosOver) console.log(`  OVER: ${c.set} on ${c.on} (${c.elements}, ${where(c.pack)}) ${fmt(c.ratio)}`);

writeFileSync(process.argv[4], JSON.stringify({ singles, combos }));
console.log(`GATE: ${singlesOver.length + combosOver.length === 0 ? 'PASS' : 'FAIL'} (singles over ${singlesOver.length}, combos over ${combosOver.length})`);
```

(The plan author ran it against a stub engine and grid: one rune row at 2.10× on the pack and one set at 3.50× print their `OVER:` lines and `GATE: FAIL (singles over 1, combos over 1)`; within the ceilings it prints `GATE: PASS`.)

`rune-use.mjs`:

```js
// What the autopilot does with runes over the pacing seeds' 12 dives: its weapon's open sockets,
// the runes socketed in them, the pouch, the deepest depth and Power at the end.
// Usage: node rune-use.mjs <engine dist/index.js>
import { pathToFileURL } from 'node:url';
const E = await import(pathToFileURL(process.argv[2]).href);
const registry = E.createDefaultRegistry();
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
for (const seed of [1, 2, 3, 4]) {
  const { profile: p, reports } = E.runAutopilot(registry, { seed, dives: 12 });
  const weapon = p.equipped.weapon;
  const chains = weapon ? E.movesetOf(registry, weapon).chains : {};
  const sockets = Object.values(chains).flatMap((c) =>
    (Array.isArray(c) ? c : c.moves).flatMap((m) => m.runes ?? []),
  );
  const held = sockets.filter(Boolean).map((r) => `${r.id} ${ROMAN[r.tier - 1]}`);
  const pouch = Object.values(p.runes ?? {}).reduce((a, n) => a + n.reduce((x, y) => x + y, 0), 0);
  console.log(
    `seed ${seed}: ${weapon ? weapon.rarity : 'unarmed'} weapon, sockets ${sockets.length}, socketed [${held.join(', ')}], pouch ${pouch}, depth ${reports[11].endDepth}, power ${E.profilePower(registry, p)}`,
  );
}
```

## Chunk 2: The E2E

### Task 2: The Delve E2E for runes, on all four devices

The spec's E2E line: a seeded save with a pouch and a weapon with open sockets; socket a rune in the builder and Apply; the HUD pip in a dive (autopilot on); fuse three on the Forge tab; the other Delve specs pass. To those this task adds the stop's fifth kind, the Training Grounds' unrestricted socket, and one pad-driven picker flow. Every save is seeded through the engine's bundle (`createDelveProfile` is version 7), and every test reads the saved profile back to check what Apply, the stop or a fuse wrote.

The features already exist (waves 1–2), so this is a test-after task: Step 2 runs the Delve E2E as it stands (it must pass before anything is added); the new tests then pass on their first run unless a wave named a selector otherwise (see Cross-area needs), in which case the failure names the missing test id: map it in the E2E, not in the component.

**Files:**
- Create: `packages/client/e2e/delve-runes.spec.ts`
- Modify: `packages/client/e2e/delve-gamepad.spec.ts:2,13,15-16,23,254`
- Modify: `packages/client/e2e/delve-training.spec.ts:85-88`

- [ ] **Step 1: The bundle, the dev server and the scratch config**

Run: `(cd packages/engine && pnpm build)`
Expected: tsup's "Build success" lines (the client's bundle, with every wave's engine code).

Run the PowerShell block (stops whatever owns port 5288, starts a detached Vite, waits for a 200 and prints `True`):

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\Alloy\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5288 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5288').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

Expected: `True`.

Create `packages/client/playwright.scratch.config.ts` (never commit it):

```ts
import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  globalSetup: undefined,
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://localhost:5288' },
  webServer: { command: 'echo reuse', url: 'http://localhost:5288', reuseExistingServer: true },
  projects: (base.projects ?? []).filter((p) => p.name !== 'responsive'),
});
```

- [ ] **Step 2: The Delve E2E as it stands**

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: 60 passed, 15 on each of the four devices (about 4 minutes). This is v0.50.0's E2E on the runes build: it must pass before any rune test is added. A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness; a consistent failure is a regression from waves 1–2: debug it with the page's state, don't lengthen a timeout.

- [ ] **Step 3: The runes spec**

Create `packages/client/e2e/delve-runes.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import {
  beginFloor,
  completeFloor,
  createDefaultRegistry,
  createDelveProfile,
  movesetOf,
  runeText,
  startDive,
  stopKinds,
  type DataRegistry,
  type DelveProfile,
  type GearItem,
  type RuneRef,
} from '@alloy/engine';

/**
 * Runes (see the runes spec): a seeded save with sockets and a pouch; the Anvil's picker and
 * Apply, the HUD's pips in a dive, the stop's fifth kind, and fusing on the Forge tab.
 */

const SAVE_KEY = 'alloy:delve:v2';
/** Loading the arena (Pixi, sprites) can be slow when many test browsers run at once. */
const ARENA_READY = 30_000;
const QUICK_III: RuneRef = { id: 'quick', tier: 3 };

/** `weapon` with its Primary's first move holding `runes` (one entry per open socket). */
function socketed(registry: DataRegistry, weapon: GearItem, runes: (RuneRef | null)[]): GearItem {
  const moveset = movesetOf(registry, weapon);
  const primary = moveset.chains.primary!;
  const moves = primary.moves.map((m, i) => (i === 0 ? { ...m, runes } : m));
  return {
    ...weapon,
    moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
  };
}

/** A fire hero (seed 4242), its starting sword's Primary move holding `runes`, `over` on top. */
function heroWith(
  registry: DataRegistry,
  runes: (RuneRef | null)[],
  over: Partial<DelveProfile> = {},
): DelveProfile {
  const profile = createDelveProfile(registry, 4242, { primary: 'fire' });
  const weapon = socketed(registry, profile.equipped.weapon!, runes);
  return { ...profile, equipped: { ...profile.equipped, weapon }, ...over };
}

/** Seed `profile` as the save, the bot playing the arena if `autopilot`. */
async function seed(page: Page, profile: DelveProfile, autopilot = false): Promise<void> {
  await page.addInitScript(
    ([key, value, bot]) => {
      if (sessionStorage.getItem('runes-e2e')) return;
      localStorage.clear();
      localStorage.setItem(key, value);
      if (bot) localStorage.setItem('alloy:delve:autopilot', '1');
      localStorage.setItem('alloy:delve:timescale', '2');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('runes-e2e', '1');
    },
    [SAVE_KEY, JSON.stringify(profile), autopilot] as const,
  );
}

/** The saved profile, as the store wrote it. */
function saved(page: Page): Promise<DelveProfile> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
}

/** The saved Primary's first move's sockets. */
async function primarySockets(page: Page): Promise<(RuneRef | null)[] | undefined> {
  const p = await saved(page);
  return p.equipped.weapon!.moveset!.chains.primary!.moves[0].runes;
}

test.describe('Delve runes', () => {
  test('R01: open a socket and socket a pouch rune at the Anvil, applied as one draft', async ({
    page,
  }) => {
    const registry = createDefaultRegistry();
    // No socket yet; a Link and 20 scrap pay for the first; Quick III waits in the pouch.
    await seed(
      page,
      heroWith(registry, [], { links: 1, scrap: 20, runes: { quick: [0, 0, 1, 0, 0] } }),
    );
    await page.goto('/delve');
    await page.getByTestId('tab-abilities').click();
    const cards = page.getByTestId('chain-cards');
    await expect(cards.getByTestId('socket-0')).toHaveCount(0);
    await cards.getByTestId('socket-open').click();
    await cards.getByTestId('socket-0').click();
    const picker = page.getByTestId('rune-picker');
    await expect(picker).toBeVisible();
    // The picker names the rune at its tier with its effect, as the engine's runeText fills it.
    const quick = picker.getByTestId('rune-pick-quick');
    await expect(quick).toContainText('Quick');
    await expect(quick).toContainText('III');
    await expect(quick).toContainText(runeText(registry, QUICK_III, { form: 'bolt' }).effect);
    await quick.click();
    await expect(picker).toBeHidden();
    await expect(cards.getByTestId('socket-0')).toHaveAttribute('data-rune', 'quick:3');
    // Still a draft: the save is untouched until Apply, whose label holds the socket's price.
    expect((await primarySockets(page)) ?? []).toEqual([]);
    const apply = page.getByTestId('chain-apply');
    await expect(apply).toContainText('🔗 1');
    await expect(apply).toContainText('⚙ 20');
    await apply.click();
    await expect(page.getByTestId('chain-draft')).toHaveCount(0);
    await expect.poll(() => primarySockets(page)).toEqual([QUICK_III]);
    const after = await saved(page);
    expect(after.links).toBe(0);
    expect(after.scrap).toBe(0);
    expect(after.runes.quick).toEqual([0, 0, 0, 0, 0]);
    // A filled socket shows its rune with Pull, which destroys it as shipped.
    await cards.getByTestId('socket-0').click();
    await expect(picker.getByTestId('rune-pull')).toContainText('destroys');
    await picker.getByTestId('rune-picker-close').click();
    await expect(picker).toBeHidden();
  });

  test('R02: a socketed rune shows as a pip on its ability button in a dive', async ({ page }) => {
    const registry = createDefaultRegistry();
    await seed(page, heroWith(registry, [QUICK_III]), true);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    const primary = page.getByTestId('ability-0');
    await expect(primary).toBeVisible({ timeout: ARENA_READY });
    // One dot for Quick, in the Tempo family's colour.
    const pips = primary.getByTestId('rune-pip');
    await expect(pips).toHaveCount(1);
    await expect(pips).toHaveAttribute('data-family', 'tempo');
  });

  test("R03: the stop's fifth power-up sockets a pouch rune mid-dive", async ({ page }) => {
    const registry = createDefaultRegistry();
    // An open empty socket and a fitting pouch rune, and nothing else to take: no bag, scrap,
    // Links or Mana Dust. Its first depth is cleared, so it waits at the door screen.
    let profile = heroWith(registry, [null], {
      runes: { quick: [0, 0, 1, 0, 0] },
      bag: [],
      scrap: 0,
      links: 0,
      manaDust: 0,
    });
    profile = startDive(registry, profile, 1);
    profile = completeFloor(registry, profile, beginFloor(registry, profile)).profile;
    expect(stopKinds(registry, profile)).toEqual(['rune']);
    expect(profile.dive!.stop!.offers).toEqual(['rune']);
    await seed(page, profile);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();

    await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: ARENA_READY });
    await page.getByTestId('stop-rune').click();
    const stopPicker = page.getByTestId('stop-picker');
    await expect(stopPicker).toBeVisible();
    await stopPicker.getByTestId('stop-rune-move-primary-0').getByTestId('socket-0').click();
    const picker = page.getByTestId('rune-picker');
    await expect(picker).toBeVisible();
    await picker.getByTestId('rune-pick-quick').click();
    await expect(page.getByTestId('stop-taken')).toBeVisible();
    await expect.poll(() => primarySockets(page)).toEqual([QUICK_III]);
    expect((await saved(page)).runes.quick).toEqual([0, 0, 0, 0, 0]);
  });

  test('R04: three of a rune fuse into one of the next tier on the Forge tab', async ({ page }) => {
    const registry = createDefaultRegistry();
    await seed(page, heroWith(registry, [], { scrap: 20, runes: { split: [3, 0, 0, 0, 0] } }));
    await page.goto('/delve');
    await page.getByTestId('tab-forge').click();
    const pouch = page.getByTestId('rune-pouch');
    await expect(pouch).toBeVisible();
    await pouch.getByTestId('rune-fuse-split-1').click();
    await expect(pouch.getByTestId('pouch-split-2')).toBeVisible();
    await expect(pouch.getByTestId('pouch-split-1')).toHaveCount(0);
    await expect(page.getByTestId('scrap-count')).toHaveText('⚙ 0 scrap');
    await expect.poll(async () => (await saved(page)).runes.split).toEqual([0, 1, 0, 0, 0]);
  });
});
```

Why each seed works: the starting sword is common, so its moves cap at one socket (`socketCap.common` 1), which R01's Link and 20 scrap open (`socketLinks[0]`, `socketScrap[0]`) and Quick fits (every form); edits are free before the first dive (`stats.dives === 0`), so R01's Apply costs only the socket. R03 clears no floor in the browser: the engine plays its first depth as cleared (`completeFloor` on a fresh `beginFloor` world), so the save opens at the door screen ("RESUME DIVE"), and with an empty bag, no scrap, Links or Mana Dust (a started dive's edits cost `editDust`) the only kind that applies is `'rune'`, so `rollStop` offers exactly it (the two `expect`s before the page loads guard that). R04's 20 scrap is `fuseScrap[0]`.

- [ ] **Step 4: The pad's picker flow**

In `packages/client/e2e/delve-gamepad.spec.ts`:

Replace:

```ts
import { createDefaultRegistry, createDelveProfile, defaultMoveset } from '@alloy/engine';
```

with:

```ts
import {
  createDefaultRegistry,
  createDelveProfile,
  defaultMoveset,
  type Moveset,
} from '@alloy/engine';
```

Replace:

```ts
const BUTTON = { a: 0, b: 1, lb: 4, rb: 5, lt: 6, menu: 9, down: 13, left: 14, right: 15 } as const;
```

with:

```ts
const BUTTON = {
  a: 0,
  b: 1,
  lb: 4,
  rb: 5,
  lt: 6,
  menu: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** `moveset` with one open, empty socket on its Primary's first move. */
function withSocket(moveset: Moveset): Moveset {
  const primary = moveset.chains.primary!;
  const moves = primary.moves.map((m, i) => (i === 0 ? { ...m, runes: [null] } : m));
  return { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } };
}
```

Replace:

```ts
/** A fire hero's save, its sword's Primary at `primarySlots` slots of default moves. */
async function setup(page: Page, autopilot: boolean, primarySlots = 1): Promise<void> {
```

with:

```ts
/**
 * A fire hero's save, its sword's Primary at `primarySlots` slots of default moves; with
 * `socket`, its first move has one open, empty socket and Quick III waits in the pouch.
 */
async function setup(
  page: Page,
  autopilot: boolean,
  primarySlots = 1,
  socket = false,
): Promise<void> {
```

Replace:

```ts
    equipped: { ...profile.equipped, weapon: { ...sword, moveset } },
```

with:

```ts
    equipped: {
      ...profile.equipped,
      weapon: { ...sword, moveset: socket ? withSocket(moveset) : moveset },
    },
    runes: socket ? { quick: [0, 0, 1, 0, 0] } : profile.runes,
```

Replace:

```ts
  test('G03: RB and LB step through the Anvil tabs', async ({ page }) => {
```

with:

```ts
  test('G07: the D-pad and A socket a pouch rune through the picker, and B backs out of it', async ({
    page,
  }) => {
    await setup(page, false, 1, true);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-abilities')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.down);
    await expect(page.getByTestId('chain-skill-primary')).toBeFocused();
    const focused = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    /** Press down, then up, until `id` has the focus (on a phone the tab bar sits in between). */
    const padTo = async (id: string) => {
      for (let i = 0; i < 6 && (await focused()) !== id; i++) await tap(page, BUTTON.down);
      for (let i = 0; i < 6 && (await focused()) !== id; i++) await tap(page, BUTTON.up);
      expect(await focused()).toBe(id);
    };
    // The Primary's move: past its card and reorder buttons to its one open socket.
    await padTo('socket-0');
    const picker = page.getByTestId('rune-picker');
    // A opens the picker, which takes the focus; B backs out, the focus back on the socket.
    await tap(page, BUTTON.a);
    await expect(picker).toBeVisible();
    await expect.poll(focused).toMatch(/^rune-/);
    await tap(page, BUTTON.b);
    await expect(picker).toBeHidden();
    await expect(page.getByTestId('socket-0')).toBeFocused();
    // Again, and A on Quick sockets it: a draft until Apply.
    await tap(page, BUTTON.a);
    await expect(picker).toBeVisible();
    await padTo('rune-pick-quick');
    await tap(page, BUTTON.a);
    await expect(picker).toBeHidden();
    await expect(page.getByTestId('socket-0')).toHaveAttribute('data-rune', 'quick:3');
    const sockets = () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('alloy:delve:v2')!).equipped.weapon.moveset.chains.primary
            .moves[0].runes,
      );
    expect(await sockets()).toEqual([null]);
    await page.getByTestId('chain-apply').click();
    await expect.poll(sockets).toEqual([{ id: 'quick', tier: 3 }]);
  });

  test('G03: RB and LB step through the Anvil tabs', async ({ page }) => {
```

(The picker's `data-pad-scope` takes the focus as it opens: `keepFocus` moves a focus left outside the newest scope to its first control while the pad holds the input lock.)

- [ ] **Step 5: The Training Grounds' socket**

In `packages/client/e2e/delve-training.spec.ts`:

Replace:

```ts
        timeout: ARENA_READY,
      })
      .toBeGreaterThan(0);
  });
```

with:

```ts
        timeout: ARENA_READY,
      })
      .toBeGreaterThan(0);
  });

  test('T02: socket any rune at any tier, free, and its pip shows on the button', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/delve');
    await page.getByTestId('training-button').click();
    const ability0 = page.getByTestId('ability-0');
    await expect(ability0).toBeVisible({ timeout: ARENA_READY });
    await expect(ability0.getByTestId('rune-pip')).toHaveCount(0);

    await openPanel(page);
    await page.getByTestId('training-tab-abilities').click();
    const cards = page.getByTestId('chain-cards');
    // No pouch and no price: every move takes up to 3 sockets, whatever the weapon.
    await cards.getByTestId('socket-open').click();
    await expect(cards.getByTestId('socket-open')).toBeVisible();
    await cards.getByTestId('socket-0').click();
    const picker = page.getByTestId('rune-picker');
    await expect(picker).toBeVisible();
    await picker.getByTestId('rune-tier-5').click();
    await picker.getByTestId('rune-pick-echo').click();
    await expect(picker).toBeHidden();
    await expect(cards.getByTestId('socket-0')).toHaveAttribute('data-rune', 'echo:5');
    await resume(page);
    const pips = ability0.getByTestId('rune-pip');
    await expect(pips).toHaveCount(1);
    await expect(pips).toHaveAttribute('data-family', 'tempo');
  });
```

- [ ] **Step 6: Run the Delve E2E**

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts e2e/delve-runes.spec.ts)`
Expected: 84 passed, 21 on each of the four devices (delve 8, gamepad 7, training 2, runes 4; about 5 minutes). A failure that names a missing test id is a selector a wave named otherwise: find the wave's name in its component and use it here. A timeout under load that passes on a rerun is flakiness; a consistent failure is a regression: debug it with the page's state.

Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
(cd packages/client && npx prettier --write e2e/delve-runes.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)
git add packages/client/e2e/delve-runes.spec.ts packages/client/e2e/delve-gamepad.spec.ts packages/client/e2e/delve-training.spec.ts
git commit -m "test(client): the Delve E2E on runes: the Anvil's picker and Apply, the HUD pip, the stop's fifth kind, fusing, the pad and the Training Grounds" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(The code above is already Prettier-formatted, checked on a scratch copy: `--write` changes nothing if typed as written. The three files are LF and were Prettier-clean at `81b0e31`.)

## Chunk 3: The docs, the version and the full verification

### Task 3: The Delve notes and the 4a spec's pricing note

**Files:**
- Modify: `CLAUDE.md` (the Delve section: the Spec bullet, the Weapon movesets bullet, a new Runes bullet before the Client bullet, the Client bullet's schema version, the DPS Lab bullet; CRLF, hand-edit, never format)
- Modify: `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md` ("Changes and their price"; LF, never format)

- [ ] **Step 1: CLAUDE.md**

In the file's order, top to bottom: each edit replaces part of one line of the Delve section, but the fourth, which adds the Runes bullet before the Client bullet. The text names the runes Drain and Volatile; the code under them is `manaOnHit`, `HeroEntity.drained`, `delve.runes.drainFoes` (Drain) and `catalyst`, `runeFx` `'volatile'` (Volatile).

In `CLAUDE.md` (CRLF: hand-edit):

Replace:
```markdown
weapon movesets (chains on the weapon, Links, the dive lock, stops): `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md`
```
with:
```markdown
weapon movesets (chains on the weapon, Links, the dive lock, stops): `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md`; runes (sockets on moves, the pouch, knobs, fusing): `docs/superpowers/specs/2026-09-30-delve-runes-design.md`
```

Replace:
```markdown
Edits cost Mana Dust (`movesetEditPrice`: moves matched by what they are, the longest shared run free, `editDust` a moved or changed move, `elementDust` changed elements, `editDust` a move left unpaired (a removal or a new move), and `elementDust` once per Apply for each element set no old move has, however many moves take it: a true minimum, so a batch never costs more than its edits one by one; `editPrice` applies the first-dive freebie)
```
with:
```markdown
Edits cost Mana Dust (`movesetEditPrice`, priced by origin since v0.51.0, the builder's record of where each new move came from (`ChainOrigins`: `origins[skill][j]` the saved index move `j` came from, null for a new move; missing origins are the identity map): the moves whose origins form the longest increasing run are in place and free, any other moved move costs `editDust`, a kept move's changed kind or form `editDust` and its changed elements `elementDust`, a new move and a removed one `editDust` each (so removing a move and adding one alike costs 2 × `editDust`: 4a's matching moves by what they are is retired), `elementDust` once per Apply for each new element set, and a changed payment `editDust`; `editPrice` applies the first-dive freebie)
```

Replace:
```markdown
equip a bag item as it is, add a slot, adjust one move, or upgrade an item
```
with:
```markdown
equip a bag item as it is, add a slot, adjust one move, upgrade an item, or socket a rune
```

Replace:
```markdown
- **Client**: `pages/DelveCamp.tsx`
```
with:
```markdown
- **Runes** (spec: `docs/superpowers/specs/2026-09-30-delve-runes-design.md`): every move and basic blow holds **sockets**, `Move.runes` / `Blow.runes` (`(RuneRef | null)[]`: its length the open sockets, `null` an empty one, absent none; `RuneRef` is `{ id, tier }`, tier 1–5 shown I–V), each holding one **rune**. A move starts at 0; the cap per move is the weapon rarity's (`socketCap`: common and uncommon 1, magic and rare 2, epic and legendary 3, at most `MAX_SOCKETS`; unarmed 0), a socket is opened for Links and scrap by its index (`socketPrice`: 1 + 20, 2 + 40, 3 + 60) and never closed, and weapon drops roll some open by rarity (`rollSockets`, from `rng.fork('sockets')` after the moveset, so every other stat rolls as before). Loose runes live in the pouch, `profile.runes` (`RunePouch`: rune id → five counts by tier; no bag space). The 14 runes are data rows in `src/data/runes.json` (`RuneDefSchema`; `registry.getRunes` / `getRune` / `findRune`) in four families: Shape (Split, Multi-shot, Pierce, Chain, Widen), Tempo (Quick, Echo, Heavy), Elemental (Saturate, Linger, Volatile) and Sustain (Leech, Drain, Guard). A row holds five tiers of **knobs**, its fits (`fits.forms`; `fits.weapons`, whose basic blows it fits; `fits.kinds`, the blow kinds it acts on, dormant on any other) and its text templates, which only `runeText` fills (the client never formats a rune's numbers); the pure helpers live in `src/loot/runes.ts` (`runeFits`, `runeActive`, `runeKnobs`, `weaponParts`, the pouch's). The sim reads only knobs: `resolveAbility` and `computeHeroStats` merge a move's active runes with its elements, fusion and legendaries (`mergeKnobs`, `NEUTRAL`; `ResolvedAbility.runes` and `HeroBlow.runes` are the runes acting, the list the builder's dormant marks and the HUD both read), and each new knob has one handler: `split` (`impact.ts`, and a basic shot's hit in `step.ts`: evenly spaced shards, `form: 'shard'`, that never split, chain, linger, echo or burst), `extraShots` (`resolve.ts` adds to Volley's and Barrage's count, with half the per-shot cut on Volley and none on Barrage; `forms.ts` fans Bolt and Lance, `basic.ts` a shot blow), `echo` (`abilities/echo.ts`: `queueEcho` / `echoTick` replay the move as it landed, or a blow through `landBlow`, `echoDelay` later, free and never echoing again), `quick` (cooldown and wind-up, and the beat through `moveBeat`; a blow's cycle and startup), `stacksBonus` (Saturate), `catalyst` (Volatile: adds to the Catalyst legendary's factor in `react`), `manaOnHit` (Drain: mana per foe-hit, up to `drainFoes` a cast, counted per skill in `HeroEntity.drained`) and `guardOnLand` (Guard: `guardLand` in `defend.ts` feeds Obsidian's barrier and never extends a larger one); the hit-time knobs ride `HitOpts` through `knobHitOpts`, and `Knobs.pierce` is a count (`true` in data is `Infinity`; a shot's `Projectile.pierceLeft` counts down, `pierce` stays its spawn flag). A new rune from existing knobs is one row in `runes.json`; one that needs a new knob adds it to `Knobs`, `NEUTRAL`, `mergeKnobs` and `KnobsSchema`, its one handler, and its term in Power's `damagePerUse` or `estimateCombat`. **Changing runes** goes through the Anvil's draft with every move edit, in `src/delve/runes.ts`: `setChains(registry, profile, chains, { origins, unsocket })` charges the per-origin Dust (see Weapon movesets) plus `runeChange` (socketing is free, out of the pouch; opening a socket costs its Links and scrap; a rune that ends up elsewhere is a pull plus a socket; a removed move's sockets come back as Links and its runes are pulled; Links are netted), and refuses a rune that doesn't fit its move (so a form change while one wouldn't fit), the same rune twice on a move, past the cap, fewer sockets on a kept move, and an unpaid draft or pouch; `draftPrice` is the builder's total (`openSocket`, `socketRune` and `fuseRunes` are single ops). **The pull rule**, `unsocketMode` (`delve.runes.unsocket`): `'destroy'` as shipped, or `'pay'` (`pullScrap` by tier, the rune back to the pouch); dev builds override it with the chip beside "↺ Restart Delve (dev)" (localStorage `alloy:delve:unsocket`). **The parts rule:** a socket that goes other than through Apply (a salvaged weapon, fused gear, a transfer's dropped or capped moves or unfitting blow runes, `chooseStartingMana`, the load-time trims; `weaponParts`) comes back as one Link, its rune destroyed or back to the pouch free by the pull rule; the results carry `runes` and `destroyed` for the toasts. A transfer moves each kept move's sockets with it (`transferScrap` each). **Drops:** `dropRune` (`arpg/rune-drops.ts`, called in `killMonster`, never in the sandbox) rolls on `world.runeRng` (`dropChance` by foe kind, × the door's `dropMult` for normal and elite foes; a boss always drops one; the tier by depth, `tierDepths`, and `tierUp` for one higher); a rune drop is walked over like an item, no magnet, and banks into the pouch (`BankResult.runes`, `DiveState.runesEarned`). **Fusing:** `fuseRunes` turns `fuseCount` (3) of a rune and tier into one of the next tier for `fuseScrap`; tier V doesn't fuse. Runes are gear: locked mid-dive, but for the stop's fifth kind, `'rune'`, which sockets one pouch rune into an open empty socket. Power values socketed runes through `damagePerUse` and `estimateCombat`; the autopilot fuses, opens sockets with the Links slots leave, and sockets each empty socket with the pouch rune that raises Power most. The save is version 7 (v6 loads with an empty pouch; at load `fitMovesets` empties unknown and repeated runes and trims sockets past the cap, and a destroyed rune becomes a toast, `ParsedDelveProfile.runesLost`). Numbers: `balance.json → delve.runes`. The client: the presentational pieces live in `features/delve/runes/` (`SocketRow`, `RunePicker`, `RuneGlyph`, `RunePouchPanel`, and `rune-style.ts`'s family colours: Shape cyan, Tempo amber, Elemental violet, Sustain green); the builder's move cards show their sockets, the picker offers the pouch runes that fit, and Apply shows the draft's price and what it destroys; the Forge tab holds the pouch and Fuse; the item sheet lists a weapon's sockets and runes, and a transfer's price its sockets; the door screen's stop has a rune pick; the arena flashes `runeFx` (`arena/fx/runes.ts`: split, echo, volatile), draws rune drops in their family's colour, and dots each HUD ability button (and the ⚔️ button) with the next move's runes (`AbilityHud.runes`, the snapshot's `basicRunes`); the Training Grounds socket any rune at any tier, free, up to 3 a move; the DPS Lab's `'rune'` view and `runeComboSetups` (every three-rune set of a form or a weapon's blows) are the balance gate's: no single rune above 2.0× its `none` row at tier III, no three-rune set above 3.0×.
- **Client**: `pages/DelveCamp.tsx`
```

Replace:
```markdown
schema version 6, validated with Zod on load; versions 2 to 5 migrate,
```
with:
```markdown
schema version 7, validated with Zod on load; versions 2 to 6 migrate,
```

Replace:
```markdown
as a single move of each kind and as the form's default chain)
```
with:
```markdown
as a single move of each kind and as the form's default chain), and each rune at tier III on each form and weapon it fits, against a `'none'` row (the `'rune'` view, with a "× none" column)
```

- [ ] **Step 2: The 4a spec's pricing note**

In `docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md` (LF; under "Changes and their price"):

Replace:
```markdown
  - **The caller applies the first-dive freebie:** `setChain` and the builder's preview charge 0 until the hero's first dive (`stats.dives === 0`).
```
with:
```markdown
  - **The caller applies the first-dive freebie:** `setChain` and the builder's preview charge 0 until the hero's first dive (`stats.dives === 0`).

  > **Superseded** (2026-09-30) by `2026-09-30-delve-runes-design.md` (v0.51.0): moves are priced by **origin**, the builder's record of where each new move came from (`ChainOrigins`: the saved index each new move came from, null for a new move; missing origins are the identity map, so an in-place edit prices as before), instead of matched by what they are. The moves whose origins form the longest increasing run are in place and free; any other moved move costs `editDust`; each origin pair's changed kind or form costs `editDust` and its changed elements `elementDust`, charged once per new element set per Apply; a new move and a removed one cost `editDust` each, so removing a move and adding one alike (× then +) now costs 2 × `editDust` where steps 2–4 above called it unchanged; a changed payment costs `editDust`. A move's sockets and runes go with its origin (a rune that ends up on another move is a pull plus a socket).
```

- [ ] **Step 3: Check the edits**

Run: `(grep -c "schema version 7" CLAUDE.md; grep -c "^- \*\*Runes\*\* (spec" CLAUDE.md; grep -c "matched by what they are" CLAUDE.md; file CLAUDE.md docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md)`
Expected: `1`, `1`, `0`; `CLAUDE.md` still "with CRLF line terminators", the 4a spec without (LF).

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/Alloy
git add CLAUDE.md docs/superpowers/specs/2026-09-30-delve-weapon-movesets-design.md
git commit -m "docs: runes in the Delve notes; moves priced by origin; save v7; the movesets spec's pricing superseded" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The version, and the full verification

**Files:**
- Modify: `packages/client/package.json:3`

- [ ] **Step 1: The version**

In `packages/client/package.json`:

Replace:
```json
  "version": "0.50.0",
```
with:
```json
  "version": "0.51.0",
```

- [ ] **Step 2: The engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run && pnpm build)`
Expected: no type errors; every test passes, the pacing rails included (v0.50.0: 1427 tests in 78 files; the waves add `delve-rune-sim.test.ts`, `delve-runes.test.ts` and their tests elsewhere); the build succeeds.

- [ ] **Step 3: The client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; every test passes (v0.50.0: 781 tests in 91 files; the waves add `features/delve/runes/**` and their own).

Run: `(pnpm -F @alloy/client build) && grep -l '0\.51\.0' packages/client/dist/assets/*.js`
Expected: the build succeeds (Vite's warning about chunks over 500 kB is expected), and grep prints one file, `packages/client/dist/assets/index-<hash>.js`: the bundle carries the new version.

- [ ] **Step 4: Prettier on the changed files**

Run (every TypeScript file changed since the plan's base, `81b0e31`, but those not Prettier-clean there: `--end-of-line auto`, since several are CRLF in the working tree and clean but for that):

`(files=$(git diff --name-only 81b0e31 HEAD -- '*.ts' '*.tsx' | grep -v -E 'arpg/geometry.ts|data/game-config.ts|delve/autopilot.ts|delve/dive.ts|loot/drops.ts|item-generator.ts|loot/smithing.ts|delve-pacing.test.ts|ItemDetailSheet.test.tsx|delve-chain-feel.test.ts'); echo "$files" | wc -l; npx prettier --end-of-line auto --check $files)`
Expected: a count (about 70: the waves' sources and tests and this plan's three E2E files), then "All matched files use Prettier code style!". A file listed is one an area left unformatted: format it with `npx prettier --end-of-line auto --write <file>`, check `git diff` shows only that area's own lines, and commit it as `style: prettier on <file>` before Step 6.

- [ ] **Step 5: The E2E on the new bundle**

Run the PowerShell block under Task 2, Step 1 (it restarts the server on the new bundle; the TabBar shows v0.51.0); expect `True`. Create `packages/client/playwright.scratch.config.ts` from Task 2, Step 1 again, then:

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts e2e/delve-runes.spec.ts)`
Expected: 84 passed, 21 on each of the four devices (about 5 minutes). Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 6: Commit the version**

```bash
cd /c/Projects/Alloy
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.51.0" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Don't push: the controller pushes after the final review.

## Verification

The area's end check is Task 4, Steps 2–5, after its commit:
- the engine's typecheck, suite (the pacing rails holding with the autopilot using runes) and build;
- the client's typecheck, suite and build (carrying 0.51.0);
- Prettier on every TypeScript file changed since `81b0e31`;
- the Delve E2E, 84 tests on four devices;
- and, from Task 1, the no-rune determinism check against wave 0's before files: the 9,144 v0.50.0 rows identical, v0.50.0's items hashing `291 49e20fb6`, and `GATE: PASS`.

`git status --short` then shows only the three unrelated `docs/superpowers/plans/2026-05-01-*.md` files and the runes plan folder as untracked, and `git log --oneline -3` the version, docs and E2E commits on top of the status-line commit (with the tuning commit under them if the user tuned).
