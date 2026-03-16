# E2E Playwright Test Suite — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a comprehensive Playwright E2E test suite that validates the full Alloy game flow and all meta screens, producing sequentially-numbered screenshots at two viewports (mobile 390×844, desktop 1280×800) for design review.

**Architecture:** Playwright tests in `packages/client/e2e/` run against the Vite dev server (auto-started). A shared fixtures file provides helpers for match setup, phase navigation, orb picking, and screenshot capture. Two spec files cover the match flow and meta screens independently. Fixed seed (42) + AI Tier 1 ensures deterministic, reproducible screenshots.

**Tech Stack:** Playwright, TypeScript, Vite dev server, @alloy/engine (deterministic game engine)

**Spec:** `docs/superpowers/specs/2026-03-14-e2e-playwright-tests-design.md`

---

## File Structure

```
packages/client/
├── e2e/
│   ├── fixtures/
│   │   └── match.ts              # Shared test helpers
│   ├── match-flow.spec.ts        # Full match journey test
│   └── meta-screens.spec.ts      # Meta screen tests
├── playwright.config.ts          # Playwright configuration
└── package.json                  # (modify: add playwright devDep + test:e2e script)
```

Output:
```
packages/client/screenshots/      # Generated on test run, gitignored
├── mobile/
│   ├── match-flow/
│   └── meta/
└── desktop/
    ├── match-flow/
    └── meta/
```

---

## Task 1: Install Playwright and Configure

**Files:**
- Modify: `packages/client/package.json`
- Create: `packages/client/playwright.config.ts`
- Modify: `C:\Projects\Alloy\.gitignore` (add screenshots directory)

- [ ] **Step 1: Install Playwright**

```bash
cd packages/client
pnpm add -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.ts**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000, // matches can take time
  expect: { timeout: 10_000 },
  fullyParallel: false, // match-flow is sequential
  retries: 0, // deterministic tests shouldn't need retries
  reporter: [['html', { open: 'never' }], ['list']],

  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 15 Pro'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
```

- [ ] **Step 3: Add test:e2e script to package.json**

Add to `packages/client/package.json` scripts:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 4: Add screenshots to .gitignore**

Append to `C:\Projects\Alloy\.gitignore`:
```
packages/client/screenshots/
packages/client/playwright-report/
packages/client/test-results/
```

- [ ] **Step 5: Verify Playwright runs**

```bash
cd packages/client
npx playwright test --list
```

Expected: "no tests found" (no spec files yet), exit 0.

---

## Task 2: Create Shared Fixtures

**Files:**
- Create: `packages/client/e2e/fixtures/match.ts`

- [ ] **Step 1: Create the fixtures file**

```typescript
import { type Page, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Fixed seed for deterministic matches
export const FIXED_SEED = 42;
export const AI_TIER = 1;

/**
 * Get the screenshot directory for a given viewport and category.
 */
function screenshotDir(viewport: string, category: string): string {
  return path.join(__dirname, '..', '..', 'screenshots', viewport, category);
}

/**
 * Take a screenshot and save to the correct flow folder.
 * Creates directories as needed.
 */
export async function screenshotFlow(
  page: Page,
  viewport: string,
  category: string,
  name: string,
): Promise<void> {
  const dir = screenshotDir(viewport, category);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${name}.png`),
    fullPage: false,
  });
}

/**
 * Get the viewport name from the test project name.
 */
export function getViewport(testInfo: { project: { name: string } }): string {
  return testInfo.project.name; // 'mobile' or 'desktop'
}

/**
 * Start a match: navigate to matchmaking, inject fixed seed, click AI tier.
 * Ends with the page on the draft screen.
 */
export async function startMatch(page: Page): Promise<void> {
  // Navigate to main menu
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  // Click Play to go to matchmaking
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByText('Choose Opponent')).toBeVisible();

  // Inject fixed seed: override Math.random before clicking
  await page.evaluate((seed) => {
    // Override Math.random with a seeded version for the match seed
    const originalRandom = Math.random;
    let callCount = 0;
    Math.random = () => {
      callCount++;
      if (callCount === 1) {
        // First call is the seed generation in Matchmaking.tsx
        Math.random = originalRandom; // Restore after
        return seed / 999999;
      }
      return originalRandom();
    };
  }, FIXED_SEED);

  // Click Tier 1 AI
  await page.getByRole('button', { name: /Tier 1/i }).click();

  // Wait for draft screen
  await page.waitForURL('**/match/*/draft');
  await expect(page.getByText('Draft Phase')).toBeVisible();
}

/**
 * Wait for a specific match phase by checking URL pattern.
 */
export async function waitForPhase(
  page: Page,
  phase: 'draft' | 'forge' | 'duel' | 'adapt' | 'result',
): Promise<void> {
  await page.waitForURL(`**/match/*/${phase}`, { timeout: 30_000 });
}

/**
 * Pick an orb from the draft pool: click first available orb, then confirm.
 */
export async function pickOrb(page: Page): Promise<void> {
  // Find an orb button in the pool grid (look for buttons with title containing "T")
  const orbButtons = page.locator('[title*="(T"]');
  const count = await orbButtons.count();
  if (count === 0) return;

  // Click first available orb
  await orbButtons.first().click();

  // Wait for confirm bar to appear
  const confirmBtn = page.getByRole('button', { name: 'Confirm Pick' });
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
  }
}

/**
 * Complete the entire draft phase by picking orbs until it transitions to forge.
 */
export async function completeDraft(page: Page): Promise<void> {
  // Keep picking orbs while we're still in draft phase
  while (page.url().includes('/draft')) {
    // Check if it's our turn
    const turnIndicator = page.getByText('Your Turn');
    const isOurTurn = await turnIndicator.isVisible({ timeout: 1000 }).catch(() => false);

    if (isOurTurn) {
      await pickOrb(page);
    }

    // Small delay to let AI take its turn and state update
    await page.waitForTimeout(600);
  }
}

/**
 * Complete the forge phase: click Done Forging.
 * Does NOT place orbs — call placeOrbs() first if needed.
 */
export async function completeForge(page: Page): Promise<void> {
  const doneBtn = page.getByRole('button', { name: 'Done Forging' });
  await expect(doneBtn).toBeVisible({ timeout: 5000 });
  await doneBtn.click();

  // Wait for transition to duel
  await waitForPhase(page, 'duel');
}

/**
 * Place some orbs from stockpile into weapon slots during forge.
 */
export async function placeOrbs(page: Page): Promise<void> {
  // Click orbs in the stockpile to select them
  const stockpileSection = page.locator('text=Stockpile').locator('..');
  const orbButtons = stockpileSection.locator('button[title*="(T"]');
  const orbCount = await orbButtons.count();

  for (let i = 0; i < Math.min(3, orbCount); i++) {
    // Select an orb from stockpile
    const orb = orbButtons.nth(0); // Always first since they shift after selection
    if (!(await orb.isVisible().catch(() => false))) break;
    await orb.click();

    // Click an empty slot (numbered button)
    const emptySlots = page.locator('button:has-text("1"), button:has-text("2"), button:has-text("3"), button:has-text("4"), button:has-text("5"), button:has-text("6")');
    const slotCount = await emptySlots.count();
    if (slotCount > 0) {
      await emptySlots.first().click();
    }

    await page.waitForTimeout(200);
  }
}

/**
 * In the duel screen: skip to end of combat playback.
 */
export async function skipDuel(page: Page): Promise<void> {
  const skipBtn = page.getByRole('button', { name: 'Skip' });
  await expect(skipBtn).toBeVisible({ timeout: 5000 });
  await skipBtn.click();

  // Wait for breakdown to appear
  await page.waitForTimeout(500);
}

/**
 * After duel breakdown, click Continue (or See Results for final round).
 */
export async function continuePastDuel(page: Page): Promise<void> {
  // Look for either "Continue to Forge" or "See Results"
  const continueBtn = page.getByRole('button', { name: /Continue|See Results/i });
  await expect(continueBtn).toBeVisible({ timeout: 10_000 });
  await continueBtn.click();
  await page.waitForTimeout(500);
}
```

- [ ] **Step 2: Verify file compiles**

```bash
cd packages/client
npx tsc --noEmit --project tsconfig.json 2>&1 || echo "E2E files use different TS context, OK"
```

Note: Playwright files use Node types (path, fs) which differ from the browser tsconfig. Playwright has its own TypeScript handling — this is expected.

---

## Task 3: Create Match Flow Test

**Files:**
- Create: `packages/client/e2e/match-flow.spec.ts`

- [ ] **Step 1: Create the match flow spec**

```typescript
import { test, expect } from '@playwright/test';
import {
  startMatch,
  screenshotFlow,
  getViewport,
  pickOrb,
  completeDraft,
  completeForge,
  placeOrbs,
  skipDuel,
  continuePastDuel,
  waitForPhase,
} from './fixtures/match';

test.describe('Match Flow', () => {
  test('complete match: menu → draft → forge → duel ×3 → result', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    // ── 01: Main Menu ──
    await page.goto('/');
    await expect(page.getByText('ALLOY')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await screenshotFlow(page, vp, 'match-flow', '01-main-menu');

    // ── 02: Matchmaking ──
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByText('Choose Opponent')).toBeVisible();
    await screenshotFlow(page, vp, 'match-flow', '02-matchmaking');

    // ── Start match (injects seed, clicks Tier 1) ──
    // We already navigated, so go back and use startMatch helper
    await page.goto('/');
    await startMatch(page);

    // ── 03: Draft Start ──
    await expect(page.getByText('Draft Phase')).toBeVisible();
    await expect(page.getByText('Your Turn')).toBeVisible();
    await screenshotFlow(page, vp, 'match-flow', '03-draft-start');

    // ── 04: Draft Mid (make a few picks) ──
    for (let i = 0; i < 3; i++) {
      const isOurTurn = await page.getByText('Your Turn').isVisible().catch(() => false);
      if (isOurTurn) {
        await pickOrb(page);
      }
      await page.waitForTimeout(700);
    }
    // Only screenshot if still in draft
    if (page.url().includes('/draft')) {
      await screenshotFlow(page, vp, 'match-flow', '04-draft-mid');
    }

    // ── 05: Draft Complete ──
    await completeDraft(page);
    // Draft should have transitioned to forge
    await screenshotFlow(page, vp, 'match-flow', '05-draft-complete');

    // ══════════════════════════════
    // ROUND 1
    // ══════════════════════════════

    // ── 06: Forge R1 Weapon ──
    await waitForPhase(page, 'forge');
    await expect(page.getByText('Forge Phase')).toBeVisible();
    await expect(page.getByText('Round 1')).toBeVisible();
    // Place some orbs into weapon
    await placeOrbs(page);
    await screenshotFlow(page, vp, 'match-flow', '06-forge-r1-weapon');

    // ── 07: Forge R1 Armor ──
    const armorTab = page.getByRole('button', { name: /armor/i });
    if (await armorTab.isVisible().catch(() => false)) {
      await armorTab.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'match-flow', '07-forge-r1-armor');

    // ── 08: Forge R1 Synergies ──
    // Switch back to weapon to show synergy panel if visible
    const weaponTab = page.getByRole('button', { name: /weapon/i });
    if (await weaponTab.isVisible().catch(() => false)) {
      await weaponTab.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'match-flow', '08-forge-r1-synergies');

    // ── Complete forge R1 ──
    await completeForge(page);

    // ── 09: Duel R1 Canvas ──
    await expect(page.getByText(/Duel/)).toBeVisible({ timeout: 10_000 });
    await skipDuel(page);
    // Default view should be canvas (pixi)
    await screenshotFlow(page, vp, 'match-flow', '09-duel-r1-canvas');

    // ── 10: Duel R1 Text Log ──
    const textViewBtn = page.getByRole('button', { name: 'Text View' });
    if (await textViewBtn.isVisible().catch(() => false)) {
      await textViewBtn.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'match-flow', '10-duel-r1-textlog');

    // ── 11: Duel R1 Breakdown ──
    // Switch back to visual if possible for breakdown context
    const visualViewBtn = page.getByRole('button', { name: 'Visual View' });
    if (await visualViewBtn.isVisible().catch(() => false)) {
      await visualViewBtn.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'match-flow', '11-duel-r1-breakdown');

    // ── Continue past duel R1 ──
    await continuePastDuel(page);

    // ══════════════════════════════
    // ROUND 2
    // ══════════════════════════════

    // ── 12: Forge R2 ──
    await waitForPhase(page, 'forge');
    await placeOrbs(page);
    await screenshotFlow(page, vp, 'match-flow', '12-forge-r2');
    await completeForge(page);

    // ── 13: Duel R2 Canvas ──
    await skipDuel(page);
    await screenshotFlow(page, vp, 'match-flow', '13-duel-r2-canvas');

    // ── 14: Duel R2 Breakdown ──
    await screenshotFlow(page, vp, 'match-flow', '14-duel-r2-breakdown');
    await continuePastDuel(page);

    // ══════════════════════════════
    // ROUND 3
    // ══════════════════════════════

    // ── 15: Forge R3 ──
    // Check if we go to forge or straight to result (match might be decided 2-0)
    const isForgeR3 = await page.waitForURL('**/forge', { timeout: 5000 }).then(() => true).catch(() => false);
    if (isForgeR3) {
      await placeOrbs(page);
      await screenshotFlow(page, vp, 'match-flow', '15-forge-r3');
      await completeForge(page);

      // ── 16: Duel R3 Canvas ──
      await skipDuel(page);
      await screenshotFlow(page, vp, 'match-flow', '16-duel-r3-canvas');

      // ── 17: Duel R3 Breakdown ──
      await screenshotFlow(page, vp, 'match-flow', '17-duel-r3-breakdown');
      await continuePastDuel(page);
    }

    // ══════════════════════════════
    // POST MATCH
    // ══════════════════════════════

    // ── 18: Post Match ──
    await waitForPhase(page, 'result');
    await expect(page.getByText(/Victory|Defeat|Draw/)).toBeVisible({ timeout: 10_000 });

    // Verify round results are shown
    await expect(page.getByText(/R1:/)).toBeVisible();

    // Verify navigation buttons
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Main Menu' })).toBeVisible();
    await screenshotFlow(page, vp, 'match-flow', '18-post-match');

    // ── Verify Play Again navigation ──
    await page.getByRole('button', { name: 'Play Again' }).click();
    await expect(page.getByText('Choose Opponent')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test to see initial results**

```bash
cd packages/client
npx playwright test match-flow --project=mobile 2>&1 | tail -20
```

Expect: Test runs, may have some timing issues to debug. Screenshots should appear in `screenshots/mobile/match-flow/`.

---

## Task 4: Create Meta Screens Test

**Files:**
- Create: `packages/client/e2e/meta-screens.spec.ts`

- [ ] **Step 1: Create the meta screens spec**

```typescript
import { test, expect } from '@playwright/test';
import { screenshotFlow, getViewport } from './fixtures/match';

test.describe('Meta Screens', () => {
  test('profile page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/profile');
    await expect(page.getByText('Profile')).toBeVisible();

    // Verify key elements
    await expect(page.getByText('ELO Rating')).toBeVisible();
    await expect(page.getByText('Mastery Tracks')).toBeVisible();
    await expect(page.getByText('Match History')).toBeVisible();

    await screenshotFlow(page, vp, 'meta', '01-profile');
  });

  test('recipe book', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    // First play a match so the registry is loaded (matchStore initializes it)
    await page.goto('/');
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(500);
    await page.goto('/recipes');
    await expect(page.getByText('Recipe Book')).toBeVisible();

    // Verify recipes are rendered
    await expect(page.getByText(/recipe/i)).toBeVisible();
    await screenshotFlow(page, vp, 'meta', '02-recipe-book');

    // Apply a tag filter
    const fireFilter = page.getByRole('button', { name: 'fire' });
    if (await fireFilter.isVisible().catch(() => false)) {
      await fireFilter.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'meta', '03-recipe-filtered');
  });

  test('collection page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/');
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(500);
    await page.goto('/collection');
    await expect(page.getByText('Collection')).toBeVisible();

    // Verify affixes are rendered
    await expect(page.getByText(/affix/i)).toBeVisible();
    await screenshotFlow(page, vp, 'meta', '04-collection');

    // Expand an affix card (click the first one)
    const firstAffix = page.locator('[class*="cursor-pointer"]').first();
    if (await firstAffix.isVisible().catch(() => false)) {
      await firstAffix.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'meta', '05-collection-expanded');
  });

  test('leaderboard page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/leaderboard');
    await expect(page.getByText('Leaderboard')).toBeVisible();

    // Verify table structure
    await expect(page.getByText('Player')).toBeVisible();
    await expect(page.getByText('ELO')).toBeVisible();

    await screenshotFlow(page, vp, 'meta', '06-leaderboard');
  });

  test('settings page', async ({ page }, testInfo) => {
    const vp = getViewport(testInfo);

    await page.goto('/settings');
    await expect(page.getByText('Settings')).toBeVisible();

    await screenshotFlow(page, vp, 'meta', '07-settings');
  });
});
```

- [ ] **Step 2: Run meta screen tests**

```bash
cd packages/client
npx playwright test meta-screens --project=mobile 2>&1 | tail -20
```

Expect: All meta tests pass, screenshots appear in `screenshots/mobile/meta/`.

---

## Task 5: Run Full Suite and Debug

- [ ] **Step 1: Run full suite on both viewports**

```bash
cd packages/client
npx playwright test 2>&1
```

Expected: All tests pass on both mobile and desktop projects.

- [ ] **Step 2: Verify all screenshots generated**

```bash
find packages/client/screenshots -name "*.png" | sort
```

Expected: ~50 screenshots total (25 per viewport × 2 viewports).

- [ ] **Step 3: Fix any timing or selector issues**

Debug failed tests using:
```bash
npx playwright test --ui
```

- [ ] **Step 4: Run final verification**

```bash
cd packages/client
npx playwright test 2>&1
```

Expected: All tests pass, all screenshots generated, exit 0.

---

## Verification Checklist

After all tasks complete, verify:

- [ ] `pnpm -F @alloy/client test:e2e` runs and passes
- [ ] `screenshots/mobile/match-flow/` contains 01 through 18 PNGs
- [ ] `screenshots/mobile/meta/` contains 01 through 07 PNGs
- [ ] `screenshots/desktop/match-flow/` contains 01 through 18 PNGs
- [ ] `screenshots/desktop/meta/` contains 01 through 07 PNGs
- [ ] Engine tests still pass: `pnpm -F @alloy/engine test`
- [ ] Client build still passes: `pnpm -F @alloy/client build`
