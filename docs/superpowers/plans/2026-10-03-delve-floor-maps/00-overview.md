# Delve floor maps Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Procedurally generated Delve floors, shipping as v0.60.0 with save v10: 5–8 rooms joined by halls on a tile grid, with collision, line of sight, flow-field pathing, leashing, sealed dens and boss rooms, special rooms (vault, elite den, sanctum/shrine, anvil alcove), an exit gate, fog of war and a minimap that reveals, a pixel floor built from the map, a bot that explores (thorough and beeline policies), and every number in data.

**Architecture:** Phase A lays the contract and the grid core: types, data, `moveCircle` / `lineOfSight` swapped in for every rectangle clamp (behaviour identical on the default `openRoom` layout, so every existing test stays green), typed stubs and tick hooks in their owners' files, `FloorOptions` pass-through in `beginFloor`, the `interact` action, save v10. Phase B fills the engine (B1 generator, B2 physics and AI, B3 floor flow in parallel; B4 bot and pacing after). Phase C builds the client (C1 rendering, C2 HUD/dialogs/flow, C3 prop sprites — C3 is independent and starts at once). Phase D: balance, E2E, docs, bump.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5, PixiJS 8, Web Workers (pixel floor), Playwright; `packages/pixel-forge` for props.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-floor-maps-design.md` (authoritative: decisions, S1–S5, the map model, the hit/move site list, interactions, fog, data, phases and file ownership incl. "Shared files").

**Branches:** integration `maps/main` (worktree `C:/Projects/alloy-maps`), from `claude/alloy-loot-gear-system-6upsy5` at v0.59.0 + the spec. Areas: `maps/a`, `maps/b1`, `maps/b2`, `maps/b3`, `maps/b4`, `maps/c1`, `maps/c2`, `maps/c3`, `maps/d`.

| Phase | Area | Plan file | Base |
|---|---|---|---|
| A | Contract + grid core | `01-contract.md` | `maps/main` |
| B | B1 generator | `02-generator.md` | A merged |
| B | B2 physics and AI | `03-physics-ai.md` | A merged |
| B | B3 floor flow | `04-floor-flow.md` | A merged |
| B | B4 bot and pacing | `05-bot-pacing.md` | B1 + B2 + B3 merged |
| C | C1 rendering | `06-client-render.md` | A merged (real maps after B1) |
| C | C2 HUD, dialogs, flow | `07-client-hud.md` | A merged (real flow after B3) |
| C | C3 props | `08-props.md` | `maps/main` (independent) |
| D | Balance, E2E, docs | `09-balance-docs.md` | everything merged |

## Shared conventions

As `docs/superpowers/plans/2026-10-02-delve-crafting/00-overview.md` → "Shared conventions" (worktrees via `scratchpad/mkwt.ps1`; one commit per task with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; never push or merge; keep line endings, never Git Bash `sed -i` on CRLF files; prettier only with `--end-of-line auto`; never format `balance.json`, `dive.ts`, `delve-pacing.test.ts`, `CLAUDE.md`, the specs; never touch `delve-chain-feel.test.ts`; engine tasks run the whole engine suite (~50 s with the pacing rails) and rebuild the bundle before client steps; no save migrations). Appliers from earlier stages: `scratchpad/craft-b1/apply.mjs`. Beware: in PowerShell `$s` and `$S` are the same variable.

## Integrator notes
