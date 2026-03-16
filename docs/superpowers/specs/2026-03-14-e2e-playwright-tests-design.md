# Alloy E2E Playwright Test Suite — Design Spec

**Date:** 2026-03-14
**Status:** Approved

---

## Purpose

Comprehensive E2E test suite using Playwright that:
1. Validates the full game flow (main menu through match completion)
2. Validates all meta screens (profile, recipes, collection, leaderboard, settings)
3. Produces a complete set of screenshots organized by flow for design review and feedback

## Test Framework

- **Playwright** with TypeScript
- Installed in `packages/client/`
- Tests run against the Vite dev server (auto-started by Playwright)
- Fixed seed (42) and AI Tier 1 for deterministic, reproducible outcomes

## Viewports

Two sizes captured for every screenshot:
- **Mobile:** 390×844 (iPhone 15 Pro — primary target)
- **Desktop:** 1280×800

## Screenshot Organization

Screenshots grouped by user journey (flow-based), sequentially numbered:

```
screenshots/
├── mobile/
│   ├── match-flow/
│   │   ├── 01-main-menu.png
│   │   ├── 02-matchmaking.png
│   │   ├── 03-draft-start.png
│   │   ├── 04-draft-mid.png
│   │   ├── 05-draft-complete.png
│   │   ├── 06-forge-r1-weapon.png
│   │   ├── 07-forge-r1-armor.png
│   │   ├── 08-forge-r1-synergies.png
│   │   ├── 09-duel-r1-canvas.png
│   │   ├── 10-duel-r1-textlog.png
│   │   ├── 11-duel-r1-breakdown.png
│   │   ├── 12-forge-r2.png
│   │   ├── 13-duel-r2-canvas.png
│   │   ├── 14-duel-r2-breakdown.png
│   │   ├── 15-forge-r3.png
│   │   ├── 16-duel-r3-canvas.png
│   │   ├── 17-duel-r3-breakdown.png
│   │   └── 18-post-match.png
│   └── meta/
│       ├── 01-profile.png
│       ├── 02-recipe-book.png
│       ├── 03-recipe-filtered.png
│       ├── 04-collection.png
│       ├── 05-collection-expanded.png
│       ├── 06-leaderboard.png
│       └── 07-settings.png
└── desktop/
    ├── match-flow/   (same structure)
    └── meta/         (same structure)
```

## Test Files

```
packages/client/e2e/
├── playwright.config.ts
├── fixtures/
│   └── match.ts          # Shared helpers
├── match-flow.spec.ts    # Full match journey
└── meta-screens.spec.ts  # All meta screens
```

## Test: match-flow.spec.ts

One sequential test per viewport that plays through a complete match against Tier 1 AI with seed 42:

1. **Main Menu** — Navigate to `/`, verify buttons present, screenshot
2. **Matchmaking** — Click Play, verify tier options, screenshot, click Tier 1
3. **Draft Start** — Verify pool rendered, turn indicator shows "Your Turn", screenshot
4. **Draft Mid** — Make several picks (tap orb, confirm), verify stockpile grows, screenshot
5. **Draft Complete** — Let draft finish (auto-picks + AI), verify transition to forge
6. **Forge R1 Weapon** — Verify flux counter, set base stats, place orbs, screenshot weapon tab
7. **Forge R1 Armor** — Switch to armor tab, place orbs, screenshot
8. **Forge R1 Synergies** — Verify synergy tracker, screenshot if synergies visible
9. **Duel R1 Canvas** — Click Done Forging, wait for duel, skip playback, screenshot canvas view
10. **Duel R1 Text Log** — Toggle to text view, screenshot
11. **Duel R1 Breakdown** — Verify breakdown shows winner, damage stats, screenshot
12. **Forge R2** — Click Continue, verify round 2, place orbs, screenshot, complete
13. **Duel R2** — Skip, screenshot canvas, screenshot breakdown
14. **Forge R3** — Same pattern, screenshot, complete
15. **Duel R3** — Skip, screenshot canvas, screenshot breakdown
16. **Post Match** — Verify victory/defeat text, round results, Play Again and Main Menu buttons, screenshot
17. **Navigation** — Click Play Again, verify returns to matchmaking

### Key assertions:
- Draft: turn indicator toggles, pool count decreases, stockpile grows
- Forge: flux counter decrements on placement, base stat selectors visible R1 only
- Duel: HP bars present, playback controls functional, breakdown has winner
- Post-match: correct winner displayed, all round results shown
- Navigation: all phase transitions route correctly

## Test: meta-screens.spec.ts

Independent tests per viewport visiting each meta screen from main menu:

1. **Profile** — Navigate, verify ELO display, rank badge, mastery tracks, match history section, screenshot
2. **Recipe Book** — Verify recipe count matches engine (29 combinations), screenshot default view, apply tag filter, screenshot filtered results
3. **Collection** — Verify affix count matches engine (33 affixes), screenshot default, expand an affix card, screenshot expanded with tier details
4. **Leaderboard** — Verify table headers, entries rendered, current player highlighted, screenshot
5. **Settings** — Toggle colorblind mode, toggle mute, verify state changes, screenshot

### Key assertions:
- Recipe count === registry.getAllCombinations().length
- Affix count === registry.getAllAffixes().length
- Leaderboard has entries with rank, name, ELO columns
- Settings toggles persist state in UI

## Fixture: match.ts

Shared test helpers:

- `startMatch(page, seed, tier)` — Navigates from main menu to matchmaking, injects fixed seed via `page.evaluate()` (overrides Math.random), clicks the specified tier button, waits for draft screen
- `waitForPhase(page, phase)` — Waits until URL contains the phase string or DOM indicates the phase
- `screenshotFlow(page, viewport, category, name)` — Saves screenshot to `screenshots/{viewport}/{category}/{name}.png`
- `pickOrb(page)` — Clicks first available orb in pool, then clicks Confirm Pick
- `completeDraft(page)` — Repeatedly picks orbs until draft completes
- `completeForge(page)` — Places available orbs into slots, clicks Done Forging
- `skipDuel(page)` — Clicks Skip button, waits for breakdown to appear

## Determinism

- Seed 42 is injected before match creation by overriding `Math.random` via `page.evaluate()`
- AI Tier 1 (random strategy) ensures fast, predictable AI turns
- Same seed + same tier = identical pool, identical AI picks, identical duel outcomes
- Screenshots are pixel-stable across runs (same game state at each capture point)

## Setup

- Playwright installed as devDependency in `packages/client/`
- `playwright.config.ts` starts Vite dev server automatically via `webServer` config
- Screenshots directory is `.gitignore`d but generated on each run
- npm script: `pnpm -F @alloy/client test:e2e`
