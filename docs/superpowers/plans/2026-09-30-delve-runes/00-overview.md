# Delve Runes Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sockets on every move (basic blows too), opened with Links and scrap up to a cap set by the weapon's rarity, holding runes: 14 pouch items in four families, in tiers I to V, which change their move through shared behaviour knobs. This is stage 4b of the skill roadmap. It ships as v0.51.0 with save v7.

**Architecture:** Runes are data rows in `src/data/runes.json`, each a knob change per tier. `resolve.ts` merges a move's active runes into its `ResolvedAbility` the way elements' knobs merge today. The new behaviour knobs are `split`, `extraShots`, `echo`, `quick`, `stacksBonus`, `catalyst`, `manaOnHit` and `guardOnLand`; they live once in the sim, so any future rune, element or legendary can use them. The economy follows the movesets pattern: pure ops in `src/delve/` and `src/loot/runes.ts`, results not throws, the dive lock, and one price rule through the draft.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom with Testing Library), Zod 3, React 19, Zustand 5, PixiJS 8, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-delve-runes-design.md` at `81b0e31`. It holds the requirements, and its **"Build waves"** section is the contract every part of this plan builds against: the types, schemas, `runes.json` shape, balance keys and function signatures. Read the spec first. Where a plan file and the spec disagree, the spec wins; report it.

---

## The plan files

The build runs in waves. Within a wave, each area is built by its own agent in its own git worktree, on a branch made from the previous wave's merged commit. The controller merges each wave before the next one starts.

| Wave | Area | Plan file | Owns (the only files it may change) |
|---|---|---|---|
| 0 | Contract | `01-wave0-contract.md` | everything the spec's wave-0 contract lists, the "before" measurements, and the re-exports in `src/index.ts` |
| 1 | A: sim | `02-wave1a-sim.md` | `src/arpg/**` (knob handlers, rune merge in `resolve.ts`) and their tests |
| 1 | B: economy | `03-wave1b-economy.md` | `src/loot/runes.ts`, `src/loot/drops.ts`, `src/loot/item-generator.ts`, `src/delve/**` except `autopilot.ts`, and their tests |
| 1 | C: client components | `04-wave1c-components.md` | new `packages/client/src/features/delve/runes/**` and their tests |
| 2 | D: Power, autopilot, Lab | `05-wave2d-power-autopilot-lab.md` | `src/delve/hero-stats.ts` (Power), `src/delve/autopilot.ts`, `src/arpg/dps-sim.ts`, `src/arpg/bot.ts` (rune pickups), the `runeComboSetups` export in `src/index.ts`, `packages/client/src/features/delve/lab/**`, `pages/DelveLab.tsx` |
| 2 | E: client wiring | `06-wave2e-client-wiring.md` | `stores/**`, `features/delve/chains/**`, `StopPanel.tsx`, `ItemDetailSheet.tsx`, `ForgePanel.tsx`, `BagPanel.tsx`, `LootTray.tsx`, `arena/PickupFeed.tsx`, `pages/DelveCamp.tsx`, `features/delve/training/**`, `AbilitiesPanel.tsx`, `DiveSummary.tsx`, `arena/useArena.ts`, and the existing tests under `features/delve/__tests__` and `pages/__tests__` |
| 2 | F: arena visuals | `07-wave2f-arena-fx.md` | `features/delve/arena/fx/**`, `ArenaHud.tsx`, `useArenaCore.ts` (HUD snapshot only), `ArenaRenderer.ts`, `arena/arena-sounds.ts` |
| 3 | Gate, E2E, docs | `08-wave3-gate-e2e-docs.md` | balance tuning (only if the gate needs it and the user agrees), `packages/client/e2e/**`, `CLAUDE.md`, the specs' docs lines, the version |

If an area needs a file another area owns, its plan file says so under **"Cross-area needs"**, with the exact change. The controller then decides: move the change into wave 0, or have the owning area make it.

## Shared conventions (every plan file follows these)

These are the 4a plan's conventions (`docs/superpowers/plans/2026-09-30-delve-weapon-movesets.md`, the "Conventions", "Commands", "Dev server on 5288" and "E2E scratch config" sections), with these changes:

- **Worktrees.** Areas in the same wave each run in their own worktree: `git worktree add ../alloy-<area> -b runes/<area> <base>`. Link `node_modules` into it entry by entry with `cmd /c mklink /J` from PowerShell (from Git Bash, `cmd //c mklink /J` can fail with "Invalid switch"), using absolute paths. `packages/client/node_modules/@alloy/engine` is itself a junction, so point it at the worktree's own `packages/engine`. Never delete through a junction; remove junctions with `cmd //c rmdir`. Paths in the plan files are repo-relative; run them from the worktree's root.
- **One commit per task**, on the area's branch. The trailer is `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Don't push and don't merge: the controller merges.
- **Never format** these; hand-edit only (check the list again at the base commit, because 4a and v0.50.0 changed files):
  - `balance.json`
  - `packages/engine/tests/delve-pacing.test.ts`
  - `profile-schema.ts`
  - `dive.ts`
  - `autopilot.ts`
  - `item-generator.ts`
  - `BagPanel.tsx`, `ForgePanel.tsx` and `LootTray.tsx` (CRLF)
  - `__tests__/ItemDetailSheet.test.tsx`
  - `CLAUDE.md`
  - the specs
  - `loot/drops.ts`, `loot/smithing.ts` and `arpg/geometry.ts` (not Prettier-clean at `81b0e31`)

  `resolve.ts`, `targeting.ts`, `loader.ts`, `registry.ts` and `types/ability.ts` are CRLF in the working tree, so run Prettier on any file as `npx prettier --end-of-line auto`. A plain `--write` rewrites their line endings.

  Never touch `packages/engine/tests/delve-chain-feel.test.ts`: line 160 holds a raw `0xD7` byte.
- **Line endings:** keep each file's own. Check with `file <path>` before editing.
- **Edit language:** the 4a plan's "How the edits read" rules. The controller applies plans with `apply2.mjs`, which parses "Replace: … with: …", "Replace the lines from `A` up to (not including) `B` with:", "Delete the lines from …" and "Append at the end of the file:". Write every edit in those forms, with anchors that are unique in their file at that point.
- **Tests:** TDD every task. Write the failing test, run it and record the expected failure, implement, run it and record the expected pass. Each engine task runs the whole engine suite, including the pacing rails. Each client task runs the whole client suite and the client typecheck.
- **The client follows the bundle.** Rebuild the engine (`(cd packages/engine && npx tsup)`) before any client step that needs new engine code.
- **Determinism:** with no rune socketed, every number is unchanged: the DPS Lab grid, the pacing rails, the items hash and the first dives. Wave 0 records the "before" files. Every wave-1 and wave-2 engine area checks them at its end and reports any difference.

## Measurements (wave 0, Task 1)

Wave 0 records the "before" files from HEAD before any change, into the scratchpad folder `runes-before`:
- `before-depth10.json`, the DPS Lab grid;
- `pacing-before.txt`;
- `first-dives-before.txt`;
- the items hash.

It reuses the 4a scripts in the scratchpad's `movesets-before` folder (`snapshot.mjs`, `identical.mjs`, `pacing.mjs`, `first-dives.mjs`, `items-hash.mjs`) and copies them alongside. Scratchpad: `C:\Users\hahnz\AppData\Local\Temp\claude\c--Projects-Alloy\239f61fd-0a16-4600-a17d-7efef362f2cc\scratchpad` (in Bash: `/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad`).
