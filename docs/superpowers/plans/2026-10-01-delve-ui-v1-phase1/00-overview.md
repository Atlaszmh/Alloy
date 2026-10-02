# Delve UI v1 · Phase 1 (Foundation) Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 of the Delve UI v1 rebuild, shipping as v0.54.0: the forge pixel-art kit, self-hosted fonts, the Delve given the full window (no phone column, letterbox or TabBar), quarter-step UI scaling, the prompt runtime with hotkeys and scoped Esc/Menu, one focus ring, one system menu with Controls and Settings, and the Anvil shell (header, tabs, footer) around today's panels.

**Architecture:** A kit under `packages/client/src/features/delve/kit/` (components + `kit.css` + `prompts.ts`), the shell changes in AppShell/index.css/gamepad nav, item views split out of `ItemDetailSheet`, then `hub/AnvilHub` composing them. No engine change.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md` at `fe9a488` — the sections "The forge kit (Phase 1)" (its kit contract is authoritative) and "Phase 1: Foundation". Mockups and theme CSS: the spec's Appendix A; source boards in the session scratchpad `ui-canvas/project/*.dc.html`.

## The plan files and ownership (one owner per file, from the spec)

| Step | Area | Plan file | Base |
|---|---|---|---|
| 1·0 | Shared types (`kit/types.ts`, stub `kit/index.ts`, `uiStore` field names) | built directly by the controller's agent, no plan file | HEAD |
| 1A | Kit visuals | `01-kit-visuals.md` | 1·0 |
| 1B | Shell and input plumbing | `02-shell-input.md` | 1·0 |
| 1C | Item views | `03-item-views.md` | 1·0 |
| 1D | Anvil shell and menus | `04-anvil-shell.md` | 1A + 1B + 1C merged |

1A, 1B and 1C run in parallel worktrees; 1D after they merge, then the E2E updates and the bump.

## Shared conventions

As `docs/superpowers/plans/2026-09-30-delve-runes/00-overview.md`'s "Shared conventions" (worktrees with PowerShell `cmd /c mklink /J` junctions, the client's `@alloy/engine` junction pointed at the worktree's own engine; one commit per task with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; never push or merge; never-format list; `prettier --end-of-line auto`; keep line endings — a fresh worktree checks out CRLF; edit language for `scratchpad/runes/w0/apply.mjs`; TDD; never touch `delve-chain-feel.test.ts`). Client-only phase: each task runs the client suite (`npx vitest run`) and typecheck (`npx tsc --noEmit -p .`); the engine is untouched (build it once for the junction).
