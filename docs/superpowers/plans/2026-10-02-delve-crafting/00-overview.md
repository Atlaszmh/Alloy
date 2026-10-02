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
- **C3 (Codex, Loadout, Economy view):** Chunk 1 (Codex Patterns/Essences, ComparePane salvage from `salvageYield`) merges **after B2**; it carries a stand-in in `LoadoutTab.test.tsx` (old yield from `salvageValue`/`salvageDust`/`weaponParts`) that can go once B2's numbers keep those tests passing. Chunk 2 (economy model, Economy view, DPS Lab tab) runs **after B3** (needs the pinned `EconomyReport` types). B3 contract as C3 assumes it: exactly N dives in order; `income` = kept after loss, `spent` = Anvil spend between dives, `lost` (null = 0) same units; every rarity key in `forged`; plain structured-clonable data. Phase D: salvage toasts in `LoadoutTab.tsx`/`BagPane.tsx` should mention shards/patterns/essences (code in `07-client-codex-lab.md` X3). After C2+C3 merge: swap C3's inline shard-name helper for C2's `shardName` (`hub/forge/materials-text.ts`; edit in the C3 plan).
- **C1 (arena and dive):** Tasks 1–9 build on A; Task 10 (E2E D02/D03/new D08) runs after B1. Relies on B1: `settleDive` no-op when `settled`; an abandon settle sets `settled`, leaves `phase` (the client settles the abandon, shows the summary, then `closeDive`); after a settle `banked` is net and `lost` = floor haul + share; material pickups carry `dropKind: 'material'` + `material`, scrap keeps `'scrap'`; `WorldPending.items/reactions/runes`, `BankResult.runes`, `FloorResult.runes` kept; `completeFloor` moves haul → banked. D02 waits on floor-1 gear, which normals no longer drop — fix at E2E time. C1's `material-style.ts` matches C2's `materialLabel` strings — point one at the other at integration. The stop's floor haul is session state in `DelveRun` (lost on reload at a stop; accepted).
- **B2 (forge and salvage):** after B1 + B2 merge, the integrator deletes `legendaryBoost`'s leftover in `item-generator.ts` (two lines, ponytail-marked). B1's `bankWorld` must spread the dive returned by `addLootToBag` (else the mid-dive salvage haul is dropped). **Phase D / S8 gap:** a new save has 0 scrap but the cheapest forge costs ≥ 10 — give the starter kit scrap (e.g. 50) or set `forgeScrap.common`/`uncommon` to 0. Decisions: S7 fills the Primary to its cap then Basic, Ultimate, Defensive; sockets one per move round-robin; Imprint may replace a line with a better shard of its own affix; legendary salvage gives only its essence; salvage bumps `forgeCount` once per call; `previewForge` throws only on unknown ids.
