# Delve Rune Costs Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every socketed rune carries a load (per rune and tier) that raises its move's price in its chain's own payment (mana cost, charge needed, or a cast chain's channel and mana), eased by the hero's attunement in the move's element, so a fully runed Primary is a trap for a starved hero and a clear win for a supported one. Basic blows stay free. v0.52.0, no save change.

**Architecture:** Data first (`runes.json` `load` rows, `balance.json → delve.runes.load`: `bySlot`, `byForm`, `charge`, `cast`, `easePerAttune`, `easeCap`), applied once in `resolveAbility` so every reader (cast, HUD, Power, the autopilot, the DPS Lab) follows. A `manaSupport` helper feeds a builder readout; the Lab gains a sustained mode (`'starved' | 'supported'`) and a two-build gate.

**Tech Stack:** TypeScript 5.7, Vitest 3, Zod 3, React 19, Zustand 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-rune-costs-design.md` at `6e667e2`. Its **Build** section is the contract. Where a plan file and the spec disagree, the spec wins — report it.

---

## The plan files

| Step | Area | Plan file | Owns |
|---|---|---|---|
| 1 | Contract (merged before A and B) | `01-contract.md` | everything the spec's "Step 1" lists (types, data with `bySlot` 0, schemas, `runeLoad`, `loadEase`, `resolveAbility`'s load and ease, `baseCost`, Drain's `baseCost` change, `basicIncome`, `manaSupport`), green and number-identical |
| 2 | A: engine | `02-engine.md` | the spec's "A" (real loads/`bySlot`, `valuedChain`, the Lab's sustained mode and page select, the two-build gate, tuning, pacing), `delve-rune-sim.test.ts` |
| 2 | B: client | `03-client.md` | the spec's "B" (`runeText` options and `cost`, `loadText` in `loot/runes.ts`; the builder's cost, mana-support and easing lines, the pool warning, the picker and pouch texts) |
| 3 | Finish | `04-finish.md` | the spec's "Finish": E2E, CLAUDE.md, the spec's status line, v0.52.0, full verification |

A and B run in parallel worktrees from step 1's commit; the controller merges them before Finish.

## Shared conventions

Exactly as `docs/superpowers/plans/2026-09-30-delve-runes/00-overview.md`'s "Shared conventions" (worktrees with PowerShell `cmd /c mklink /J` junctions and the client's `@alloy/engine` junction pointed at the worktree's own engine; one commit per task with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; never push or merge; the never-format list; `prettier --end-of-line auto`; keep each file's line endings — a fresh worktree checks out CRLF; the edit language for `apply2.mjs`/`scratchpad/runes/w0/apply.mjs`; TDD; rebuild the engine before client steps; never touch `delve-chain-feel.test.ts`).

**Determinism:** step 1 ships with every load 0 (`bySlot` 0) and must leave every number identical to HEAD: the DPS grid, pacing, first dives, items hash (use the scratchpad's `runes-before/` scripts; record a fresh HEAD baseline in `rune-costs-before/` first, since v0.51.0's pacing differs from `runes-before`). A changes numbers on purpose and reports them.
