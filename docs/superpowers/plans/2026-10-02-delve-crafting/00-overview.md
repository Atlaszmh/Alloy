# Delve component crafting (stage 4c) Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage 4c, shipping as v0.58.0 with save v8: gear becomes rare (elites and bosses only), materials and currency become the main loot (burst + magnet pickups, banked per floor, partly lost on death), and the gear you wear is forged at the Anvil from patterns, metal bars, flux, affix shards and essences, with Hone / Reforge / Imprint sinks, refining 3→1, salvage yields, attunement-raised rolls, and every number in data.

**Architecture:** Phase A lays the contract (types, `crafting.json`, the two balance blocks, profile v8 with a reset, typed stubs for every new engine export, store actions, door shape, Fusion and migrations deleted). Phase B fills the engine in parallel worktrees (B1 drops and banking, B2 forge and salvage), then B3 the autopilot and `economySim`. Phase C builds the client in parallel (C1 arena and dive, C2 the Forge tab, C3 Codex / Loadout / Economy view). Phase D tunes to the pacing targets and updates the docs.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5, TailwindCSS v4, PixiJS 8, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-delve-component-crafting-design.md` (authoritative: decisions, S1–S9, the roll formula, banking table, drop tables, data shapes, phases and file ownership).

**Branches:** integration branch `craft/main` (worktree `C:/Projects/alloy-craft`), from `claude/alloy-loot-gear-system-6upsy5` at v0.57.1 + the spec. Areas branch from it: `craft/a`, `craft/b1`, `craft/b2`, `craft/b3`, `craft/c1`, `craft/c2`, `craft/c3`, `craft/d`.

## The plan files and ownership

| Phase | Area | Plan file | Owns (from the spec's "Phases and parallel areas") | Base |
|---|---|---|---|---|
| A | Contract | `01-contract.md` | see the spec's Phase A row | `craft/main` |
| B | B1 drops and banking | `02-drops-banking.md` | spec B1 row | A merged |
| B | B2 forge and salvage | `03-forge-salvage.md` | spec B2 row | A merged |
| B | B3 autopilot and economy | `04-autopilot-economy.md` | spec B3 row | B1 + B2 merged |
| C | C1 arena and dive | `05-client-dive.md` | spec C1 row | A merged (real data after B) |
| C | C2 the Forge tab | `06-client-forge.md` | spec C2 row | A merged |
| C | C3 Codex, Loadout, Economy view | `07-client-codex-lab.md` | spec C3 row | A merged |
| D | Balance and docs | `08-balance-docs.md` | tuning data, CLAUDE.md, the bump | everything merged |

## Shared conventions

As `docs/superpowers/plans/2026-10-01-delve-ui-v1-phase2/00-overview.md` → "Shared conventions": worktrees with node_modules junctions (`C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name <dir> -Branch <branch> -Base <base>`); one commit per task, trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; never push or merge; keep line endings (many files are CRLF; never Git Bash `sed -i` on them); prettier only with `--end-of-line auto`; never format `balance.json`, `delve-pacing.test.ts`, `CLAUDE.md`, the specs; never touch `packages/engine/tests/delve-chain-feel.test.ts` (raw 0xD7 byte). Engine tasks run the whole engine suite (with the pacing rails) and rebuild the bundle (`cd packages/engine && npx tsup`) before client steps. Client tasks run the client suite and typecheck. **Saves:** no migrations anywhere (the user's rule); v8 only.

## Integrator notes

- **Phase A review (2026-10-02):** no blocking defects. Routed: B1 skips only the pacing rails the forging-less autopilot can't meet (B3 un-skips them) and replaces every temporary path (GEAR_TODAY, the forced first-boss legendary, kill scrap on kill, step.ts speeds/delay, Lucky Charm's legendary gear weight), makes doors do what their texts say, copies `world.loot.patterns`, and spends stops from `banked` inside `takeStop`. B2 adds `shards`/`patterns`/`essences` to `BagInsertResult` (`applySalvage` alone writes the haul), `applySalvage(..., opts: { unsocket })`, and a data-consistency test. **`economySim` pinned:** `economySim(registry, seed, dives, opts?: Pick<AutopilotOptions,'primary'|'secondary'>)`; `EconomyReport` gains `profile` (final) and per dive `lost: Haul | null` — B3 implements, C3 charts it, the pacing rails call it.
- **C2 (Forge tab):** merges **after B2** (until then the Forge tab throws `refineCost: not implemented`; two AnvilHub tests that open Forge fail on `craft/c2` alone). E2E: D04 clicks `bench-temper` before counting `temper-row`; new D10 (forge an item) — both run after B2. C2 assumes of B2: `previewForge` never throws and `lines.length === affixCount`; preview `weapon.slots` = extra slots per skill; `forge` returns `item` and records the find; `refineCost` null for essences/Dust/Links/top grades; `honeCost`/`imprintCost` accept any item with lines. `materialLabel` may duplicate C1's helper — merge at integration.
