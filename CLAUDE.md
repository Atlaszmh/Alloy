# Alloy — Coding Standards & Conventions

## Project Structure

```
packages/engine/   — @alloy/engine: Pure game logic, zero UI deps, dual CJS+ESM via tsup
packages/client/   — React 19 + Vite SPA, the game UI
packages/supabase/ — DB migrations (PostgreSQL) + Deno edge functions
packages/tools/    — React balance/simulation analysis tool
packages/pixel-forge/ — Node CLI pixel art pipeline (code-drawn + Gemini sprites → sprite sheets)
```

Engine is the single source of truth for all game rules. No game logic in the client.

## Tech Stack

- TypeScript 5.7+, strict mode, ES2022 target
- pnpm 9+ workspaces
- React 19 + React Router 7 + Zustand 5 + TailwindCSS v4 + PixiJS 8
- Vitest 3.x for unit tests, Playwright for E2E
- Supabase (PostgreSQL + Deno Edge Functions + Realtime)
- Zod 3 for data validation

## Versioning

The client surfaces its version in the bottom TabBar as `v{version}`. Source of truth is `packages/client/package.json#version`, injected at build time via a `define` in both `vite.config.ts` and `vitest.config.ts`.

**Bump the version whenever you ship user-visible changes** (UI tweaks, balance tweaks, new features, bug fixes that affect play). Follow semver: patch for fixes, minor for features, major for breaking. A one-liner in the relevant commit: `chore(client): bump version to 0.X.Y`.

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
- Game logic modules: `src/draft/`, `src/forge/`, `src/duel/`, `src/combine/`, `src/run/`, `src/pool/`, `src/match/`, `src/loot/`, `src/delve/`, `src/arpg/`
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

## Delve Mode (September 2026) — the headline loop

Real-time top-down ARPG behind the main menu's DELVE button. Loop: fight packs in an arena, loot bursts onto the floor, walk over it, equip upgrades mid-fight, push deeper or extract, forge, repeat. The hero has four abilities: an automatic **basic** attack from the weapon, and a **Primary**, **Defensive** and **Ultimate** (Q/E/R) that the player builds at the Anvil from a **form** (12, e.g. Bolt, Ward, Maelstrom), one or two of six **elements** (fire/frost/storm/earth/shadow/nature; two make a fusion such as Wildfire), a **weight** (Swift to Crushing) and a **payment** (mana, charge or a cast wind-up). One mana pool: basic hits fill it, abilities spend it. Gear carries a mana element: attunement grows the pool, powers abilities of that element and grants masteries at 10. Mixing elements triggers reactions (Melt, Shatter, Overload, Superconduct, Soulfire, Combust, Blight). Basic attacks are automatic, or manual (a device preference in the dive menu: hold left click to attack toward the cursor, or the ⚔️ button on phones; `ArpgInput.attack`/`attackAim`), and the melee 3-hit combo resets after a pause. A **dodge** (Space or the 💨 button; 2 charges that refill) dashes with i-frames; an attack that would have hit early in it (even where it began) is a **perfect dodge**: the charge comes back, the next real hit crits and staggers, and the display slows for a beat (spec: `docs/superpowers/specs/2026-09-26-delve-dodge-design.md`).
- **Spec**: `docs/superpowers/specs/2026-09-24-delve-loot-mode-design.md`; abilities: `docs/superpowers/specs/2026-09-25-delve-ability-system-design.md`
- **Engine**: `src/loot/` (item generation, drops, smithing), `src/arpg/` (the real-time sim: `world.ts` floor setup, `step.ts` tick, `combat.ts`, `bot.ts`, and `abilities/`: `resolve.ts` compiles a build into a `ResolvedAbility`, `forms.ts` runs each form, `impact.ts` is the one damage path every element and fusion knob goes through, `cast.ts` handles payment, wind-ups and press-combos, `defend.ts` the Defensive effects and charge; `dodge.ts` the dodge, its charges and perfect dodges), and `src/delve/` (hero stats, attunement, Power, dive state machine, profile ops, autopilot)
- **Data**: `src/data/delve.json` (gear bases, affixes, legendaries, biomes, doors), `src/data/arpg.json` (mana, forms, element traits, fusions, reactions, masteries), plus `balance.json → delve` (`delve.abilities` holds slot costs, weight and payment numbers). Read them via `registry.getDelveData()` / `registry.getArpgData()` / `registry.getDelveBalance()`. `createDefaultRegistry()` loads everything.
- **Combat**: fixed-step (1/30 s) and deterministic. Build a floor with `beginFloor(registry, profile)`, drive it with `stepWorld(registry, world, input, dt)` at any frame rate, and render the returned `ArpgEvent`s. Bank pickups with `bankWorld`, end floors with `completeFloor` / `failFloor`.
- **Pacing guard rails**: `tests/delve-pacing.test.ts` runs the autopilot bot through the real-time sim. Re-run it after any `balance.json → delve` or `arpg.json` change, and use `runAutopilot()` for tuning sweeps.
- **Client**: `pages/DelveCamp.tsx` (`/delve`, "The Anvil", with the Abilities workshop tab, `features/delve/AbilitiesPanel.tsx`), `pages/DelveRun.tsx` (`/delve/run`, the arena; the TabBar is hidden there), `features/delve/` (the arena lives in `features/delve/arena/`: PixiJS renderer, joystick/mouse/WASD input, HUD with drag-to-aim ability buttons (`aim-gestures.ts`; hold Q/E/R to aim with the mouse), `useArena` hook), and `stores/delveStore.ts` (persisted save under `alloy:delve:v2`, schema version 3, validated with Zod on load; version 2 saves migrate).
- **Pixel floor** (`features/delve/arena/pixel/`): a cosmetic, per-biome pixel simulation under the arena: glowing rivers, lush foliage, fire, frost, craters, weather, lit by what glows. `world.ts` simulates, `render.ts` paints the on-screen window at 2× with lighting, `themes.ts` sets each biome's look, `arena-effects.ts` replays engine events onto it, and `floor-engine.ts` / `floor-worker.ts` run it in a Web Worker (`pixel-floor.ts` is the Pixi sprite, with an in-thread fallback). It never feeds back into gameplay, so it may use `Math.random`.
- **Sprites** (`features/delve/arena/sprites.ts`): the hero and monsters draw from `public/sprites/delve/atlas.{png,json}` (keyed by hero / monster `defId`, 2+ frames each) at `SPRITE_PIXEL` = 0.1 arena units per sprite pixel, the floor's density. Every sprite keeps that density (Animal Well-style): its canvas is 16 px per unit of the monster's `size` in `delve.json` (a size-0.6 rat is 10 px, a size-2.8 boss 45 px; `__tests__/sprite-atlas.test.ts` enforces it), elites are marked by their gold ring rather than drawn bigger, and hits and wind-ups lift a sprite by whole pixels instead of scaling it. Anything without a sprite falls back to its emoji. Never hand-edit the atlas: it is built by `packages/pixel-forge`.
- **Pixel art pipeline** (`packages/pixel-forge`): `art/alloy/style.json` fixes the palette (ENDESGA 32), outline and prompt; `art/alloy/manifest.json` lists every asset (its `size` canvas = 16 × the monster's size) as `code` (an ASCII sprite in `art/alloy/sprites/*.ts`) or `ai` (generated). Commands: `pnpm -F @alloy/pixel-forge forge list | build | generate <id…> [--count N] [--missing] [--workflow W] | prompts [id…] | import [id] [file…] | reclean [id…] | pick <id> <n> | clean <in> <out>`. Candidates come three ways: `generate --workflow W` runs `workflows/W.json` (a ComfyUI API-format workflow with `{{prompt}}`, `{{subject}}`, `{{size}}`, `{{seed}}` and `{{reference}}` placeholders) on a local ComfyUI at `127.0.0.1:8188` (`klein4b-sheet` fills the empty cell of a sheet of our sprites, which pixel-forge cuts back out, and matches the style best; `klein4b-pixel` and `zimage-pixel` are text-only); plain `generate` calls the Gemini API (needs `GEMINI_API_KEY`, a billing-enabled AI Studio key); or `prompts` writes `art/alloy/app-prompts.md` + `reference.png` for making them by hand in the Gemini app (covered by the subscription) and `import` cleans the saved images from `art/alloy/inbox/` (matched by file name; the app's sparkle watermark is keyed out). Each way they land with a review sheet under `art/alloy/candidates/` (git-ignored; `<n>.json` records the workflow, seed and prompt); `reclean` re-runs cleanup on existing raws, `pick` copies one to `art/alloy/ai/`, and `build` rewrites the atlas and `art/alloy/review.png`.
- **Test hooks**: localStorage `alloy:delve:autopilot = "1"` lets the engine bot play the arena (E2E uses it); `alloy:delve:timescale` speeds up the sim (max 4×).
- The classic draft → forge → duel mode is still reachable as "Play Arena".

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
