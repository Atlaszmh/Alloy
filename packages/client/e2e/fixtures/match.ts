import { type Page, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FIXED_SEED = 42;
export const AI_TIER = 1;

function screenshotDir(viewport: string, category: string): string {
  return path.join(__dirname, '..', '..', 'screenshots', viewport, category);
}

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

export function getViewport(testInfo: { project: { name: string } }): string {
  return testInfo.project.name;
}

export async function startMatch(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByText('Choose Opponent')).toBeVisible();

  // Inject fixed seed
  await page.evaluate((seed) => {
    const originalRandom = Math.random;
    let callCount = 0;
    Math.random = () => {
      callCount++;
      if (callCount === 1) {
        Math.random = originalRandom;
        return seed / 999999;
      }
      return originalRandom();
    };
  }, FIXED_SEED);

  await page.getByRole('button', { name: /Tier 1/i }).click();
  await page.waitForURL('**/match/*/draft');
  // Wait for draft UI to render (opponent/pool/your orbs sections)
  await page.waitForLoadState('networkidle');
}

export async function waitForPhase(
  page: Page,
  phase: 'draft' | 'forge' | 'duel' | 'adapt' | 'result',
): Promise<void> {
  await page.waitForURL(`**/match/*/${phase}`, { timeout: 30_000 });
}

export async function pickOrb(page: Page): Promise<void> {
  // GemCards have data-gem attribute. Find any in the pool.
  const gems = page.locator('[data-gem]');
  const count = await gems.count();

  if (count > 0) {
    // Double-click: first tap selects, second tap confirms
    await gems.first().click();
    await page.waitForTimeout(300);
    await gems.first().click();
    await page.waitForTimeout(300);
    return;
  }

  // Fallback: try old OrbIcon selector (for forge screen)
  const orbButtons = page.locator('button[title*="(T"]:not([disabled])');
  const orbCount = await orbButtons.count();
  if (orbCount > 0) {
    await orbButtons.first().click();
    await page.waitForTimeout(200);
  }
}

export async function completeDraft(page: Page): Promise<void> {
  while (page.url().includes('/draft')) {
    // Check for turn indicator — matches "YOUR PICK" or "Your Turn"
    const isOurTurn = await page.getByText(/YOUR PICK|Your Turn/i).isVisible({ timeout: 1000 }).catch(() => false);
    if (isOurTurn) {
      await pickOrb(page);
    }
    await page.waitForTimeout(600);
  }
}

export async function placeOrbs(page: Page): Promise<void> {
  // Select an orb from stockpile (enabled, has tier in title)
  const stockpileOrbs = page.locator('button[title*="(T"]:not([disabled])');

  for (let i = 0; i < 3; i++) {
    const orbCount = await stockpileOrbs.count();
    if (orbCount === 0) break;

    // Click orb to select it
    try {
      await stockpileOrbs.first().click({ timeout: 3000 });
    } catch {
      break; // Orb not clickable, stop trying
    }
    await page.waitForTimeout(200);

    // Click an empty slot — try multiple selectors
    const emptySlots = page.locator('button:has-text("+"):not([title])');
    try {
      const firstVisible = emptySlots.first();
      await firstVisible.click({ timeout: 3000 });
    } catch {
      // Slot not visible/clickable — skip this placement
      break;
    }
    await page.waitForTimeout(300);
  }
}

export async function completeForge(page: Page): Promise<void> {
  const doneBtn = page.getByRole('button', { name: 'Done Forging' });
  await expect(doneBtn).toBeVisible({ timeout: 5000 });
  await doneBtn.click();
  await waitForPhase(page, 'duel');
}

export async function skipDuel(page: Page): Promise<void> {
  const skipBtn = page.getByRole('button', { name: 'Skip' });
  await expect(skipBtn).toBeVisible({ timeout: 5000 });
  await skipBtn.click();
  await page.waitForTimeout(500);
}

export async function continuePastDuel(page: Page): Promise<void> {
  const continueBtn = page.getByRole('button', { name: /Continue|See Results/i });
  await expect(continueBtn).toBeVisible({ timeout: 10_000 });
  await continueBtn.click();
  await page.waitForTimeout(500);
}
