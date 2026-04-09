# Alloy — Coding Standards & Conventions

## Project Structure

```
packages/engine/   — @alloy/engine: Pure game logic, zero UI deps, dual CJS+ESM via tsup
packages/client/   — React 19 + Vite SPA, the game UI
packages/supabase/ — DB migrations (PostgreSQL) + Deno edge functions
packages/tools/    — React balance/simulation analysis tool
```

Engine is the single source of truth for all game rules. No game logic in the client.

## Tech Stack

- TypeScript 5.7+, strict mode, ES2022 target
- pnpm 9+ workspaces
- React 19 + React Router 7 + Zustand 5 + TailwindCSS v4 + PixiJS 8
- Vitest 3.x for unit tests, Playwright for E2E
- Supabase (PostgreSQL + Deno Edge Functions + Realtime)
- Zod 3 for data validation

## Testing

- **Engine tests**: `packages/engine/tests/*.test.ts` — Vitest, Node environment
- **Client unit tests**: `packages/client/src/**/*.test.{ts,tsx}` — Vitest, jsdom. Store tests live in `src/stores/` (NOT `__tests__/` subdirectory)
- **E2E tests**: `packages/client/e2e/*.spec.ts` — Playwright, 4 device profiles (iPhone SE, iPhone 15 Pro, Pixel 7, Desktop)
- **Tools tests**: `packages/tools/server/*.test.ts` — Vitest

### TDD Pattern

For new features, follow this cycle:
1. Write the failing test
2. Run it to verify it fails
3. Implement minimal code to make it pass
4. Run to verify it passes
5. Commit

### Determinism

All game systems must be deterministic given the same seed. Use `SeededRNG` from `packages/engine/src/rng/seeded-rng.ts`. Fork RNG streams for independent subsystems (e.g., `rng.fork('duel_1')`).

## Code Patterns

### Engine

- Types go in `src/types/` — one file per concept (gem.ts, match.ts, etc.)
- Game logic modules: `src/draft/`, `src/forge/`, `src/duel/`, `src/combine/`, `src/run/`, `src/pool/`, `src/match/`
- Data files: `src/data/*.json`, loaded and validated via Zod schemas in `src/data/schemas.ts`
- `DataRegistry` in `src/data/registry.ts` is the single access point for all game data
- All balance-tunable values go in `balance.json`, accessed via `registry.getBalance()`

### Client

- Pages in `src/pages/` — one per game phase
- Stores in `src/stores/` — Zustand, minimal state (visual/UI only, no game logic)
- Gesture code in separate files from components (e.g., `draft-gestures.ts`)
- Gateway abstraction: `LocalGateway` for AI, `RemoteGateway` for PvP
- Animations: Web Animations API on actual DOM elements, never spawn duplicates

### Naming

- Files: kebab-case (`forge-state.ts`, `local-gateway.ts`)
- Types/interfaces: PascalCase (`GemInstance`, `ForgeAction`)
- Functions: camelCase (`createGem`, `calculateStats`)
- Constants: UPPER_SNAKE_CASE (`MAX_TIER`, `RARITY_ORDER`)

## Active Refactor: Gem System (April 2026)

A major refactor is in progress. See:
- **Spec**: `docs/superpowers/specs/2026-04-08-gem-system-refactor-design.md`
- **Plan**: `docs/superpowers/plans/2026-04-08-gem-system-refactor.md`

Key things to know:
- `OrbInstance` is being replaced by `GemInstance` (two-axis: tier + rarity)
- `ForgeAction` has new variants (socket_gem, unsocket_gem, combine)
- Match flow is changing from best-of-3 to run-based (lives, goal round, endless)
- The combination system has three layers: signature recipes, category combos, generic upgrades
- All recipe discovery is hidden/experimental — no spoilers in UI

## Draft Screen (Locked)

The draft screen is fully polished and tested. Do not modify without explicit approval. See `project_draft_locked_in.md` in memory for the full quality reference.
