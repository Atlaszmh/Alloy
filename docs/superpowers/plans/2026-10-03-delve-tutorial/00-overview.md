# Delve guided start (tutorial) Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An optional guided start that runs a new save's first two dives on hand-built floors with gated steps and Hesta's guidance, plus two Anvil lessons; with it, game-wide: carries by rarity (common Basic only; uncommon and magic + Primary; rare + Defensive, awakenable to + Ultimate; epic and legendary all four; unarmed Basic), the Awaken crafting op, legendaries moved to depth 20+, quests unlocking on completion. Ships as v0.62.0, save v11.

**Architecture:** Phase A lays the contract: types, the tutorial state on the save, the extended event types, `tutorial.json` (steps, partners, floors) with its schema and load check, `Door.held` with `doorShut`, `awakened`, `essenceMinDepth`, the carries data and `carriedSkills(item)` signature, typed stubs and tick hooks in their owners' files, save v11. Phase B fills the engine (B1 script runner, B2 hand-built floors, B3 carries/Awaken/legendaries/unlocks in parallel; B4 the bot's tutorial mode and the pacing re-measure after). Phase C builds the client (C1 choice/panel/beats/retry/skip, C2 highlights/targets/floor marker, C3 Awaken bench + How to delve). Phase D: E2E, docs, balance check, bump.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5, PixiJS 8, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-tutorial-design.md` (authoritative: decisions, the player's path, the engine, the client, testing, phases).

**Branches:** integration `tut/main` (worktree `C:/Projects/alloy-tut`), from `claude/alloy-loot-gear-system-6upsy5` at v0.61.0 + the spec (3f3dcca5). Areas: `tut/a`, `tut/b1`, `tut/b2`, `tut/b3`, `tut/b4`, `tut/c1`, `tut/c2`, `tut/c3`, `tut/d`.

| Phase | Area | Plan file | Base |
|---|---|---|---|
| A | Contract | `01-contract.md` | `tut/main` |
| B | B1 script runner | `02-runner.md` | A merged |
| B | B2 hand-built floors | `03-floors.md` | A merged |
| B | B3 carries, Awaken, legendaries, unlocks | `04-carries.md` | A merged |
| B | B4 bot tutorial mode, pacing | `05-bot-pacing.md` | B1 + B2 + B3 merged |
| C | C1 choice, panel, beats, retry, skip | `06-client-panel.md` | A merged |
| C | C2 highlights, targets, floor marker | `07-client-highlights.md` | A merged |
| C | C3 Awaken bench, How to delve | `08-client-awaken.md` | A merged |
| D | E2E, docs, balance, bump | `09-finish.md` | everything merged |

## Shared conventions

- Worktrees via `scratchpad/mkwt.ps1 -Name <dir> -Branch <br> -Base <base>` (node_modules are junctions into the main repo: never `pnpm install` without `--lockfile-only`, never delete under node_modules; remove a worktree with PowerShell `cmd /c "rmdir /s /q <dir>"` then `git worktree prune`, never `git worktree remove --force`).
- One commit per task, message ending `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; never push or merge.
- Keep line endings (most files CRLF; never Git Bash `sed -i` on CRLF files); prettier only with `--end-of-line auto`; never format `balance.json`, `dive.ts`, `delve-pacing.test.ts`, `CLAUDE.md`, the specs; never touch `delve-chain-feel.test.ts`.
- Engine tasks: TDD in `packages/engine/tests/`; run the whole engine suite (~2 min with the pacing rails) and the typecheck; rebuild the bundle (`npx tsup`) before client checks. Client: the kit (`features/delve/kit/`), prompts per device, pad scopes, the 14 design-px text floor, no emoji, engine values only (the client never formats rule text: `tutorialText`, `runeText`).
- Determinism: seeded forks only. No save migrations (v11 resets older saves).
- In PowerShell `$s` and `$S` are the same variable.

## Integrator notes
