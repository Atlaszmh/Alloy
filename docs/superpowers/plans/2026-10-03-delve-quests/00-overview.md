# Delve quests Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quests for the Delve, shipping as v0.59.0 with save v9: a main chapter, side quests and a Contract board of seeded, rerollable contracts, with progress from engine quest events (always counting, even on death), rewards claimed at the Anvil into the stockpile, a new giver (Hesta, the Anvil-keeper), the Quests tab, HUD tracker and toasts filled in, and every number in data.

**Architecture:** Phase A lays the contract (types, `quests.json` schema + registry checks, `delve.quests` balance, profile v9 + reset, `WorldPending.questEvents` and the floor flags, typed stubs with their call sites wired, store actions, a minimal `useQuests` adapter). Phase B fills the engine in parallel (B1 events and progress; B2 contracts, rewards and the content). Phase C builds the client in parallel (C1 Quests tab; C2 HUD, toasts and banking; C3 Hesta's sprite — independent, can run first). Phase D: the autopilot claims, `economySim`'s quests line, the pacing rails, CLAUDE.md, the bump.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5, TailwindCSS v4, PixiJS 8, Playwright; `packages/pixel-forge` for the sprite.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-quests-design.md` (authoritative: decisions, S1–S6, the objective table, emission sites, the board rules, content, phases and file ownership).

**Branches:** integration `quest/main` (worktree `C:/Projects/alloy-quest`), from `claude/alloy-loot-gear-system-6upsy5` at v0.58.0 + the spec. Areas: `quest/a`, `quest/b1`, `quest/b2`, `quest/c1`, `quest/c2`, `quest/c3`, `quest/d`.

| Phase | Area | Plan file | Base |
|---|---|---|---|
| A | Contract | `01-contract.md` | `quest/main` |
| B | B1 events and progress | `02-events-progress.md` | A merged |
| B | B2 contracts, rewards, content | `03-contracts-rewards.md` | A merged |
| C | C1 Quests tab | `04-client-quests-tab.md` | A merged (real data after B) |
| C | C2 HUD, toasts, banking | `05-client-hud-toasts.md` | A merged |
| C | C3 Hesta's sprite | `06-hesta-sprite.md` | `quest/main` (independent) |
| D | Autopilot, balance, docs | `07-autopilot-docs.md` | everything merged |

## Shared conventions

As `docs/superpowers/plans/2026-10-02-delve-crafting/00-overview.md` → "Shared conventions" (worktrees via `scratchpad/mkwt.ps1`; one commit per task with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; never push or merge; keep line endings, never Git Bash `sed -i` on CRLF files; prettier only with `--end-of-line auto`; never format `balance.json`, `delve-pacing.test.ts`, `CLAUDE.md`, the specs; never touch `delve-chain-feel.test.ts`; engine tasks run the whole engine suite (~50 s with the pacing rails) and rebuild the bundle before client steps; no save migrations). The edit appliers from the crafting stage are in the session scratchpad (`craft-b1/apply.mjs`).

## Integrator notes
- **C2 (HUD, toasts, banking):** the notice diff `questNotices` runs in the store's `commit` (every save path). Toasts: "Objective done: <text>"; on a quest's last objective "Quest complete: <name> · claim at the Anvil" instead. Relies on B1: `bankWorld` empties `pending.questEvents`; `progress[id][i]` = objective i; contracts' progress on the board entry; `done` latches. Kills now bank on the 80 ms throttle. After B merges, watch client tests asserting exact `notices`. E2E "First Steps" can also assert the toast and tracker (after B1 + B2). Phase D: C2's CLAUDE.md line is in `05-client-hud-toasts.md` X3.
- **C1 (Quests tab):** Tasks 1–3 build on A (+C2); Task 4 (E2E Q01 claim First Steps, Q02 reroll) after B1 + B2. After C1 + C2: `QuestTracker` reads `delve.quests.maxTracked` and delete `MAX_TRACKED` from `quests/types.ts`. C1 assumes of B1's `questStates`: concrete rewards as refs, only the four rule kinds as `{ rule }`, claimed main/side quests with `status: 'claimed'`, contracts with board ids, order main (chain) → side → contracts (slot order). Of B2: `rerollContract` pure and cheap (dry run for the button), player-facing refusal text; quest names "First Steps" / "Bring It Home" kept. Choices: the quest open in the detail pane counts as seen; Reroll sits on the open contract's actions; the footer count shows only between dives.
