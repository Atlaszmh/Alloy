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
  // PhaseRouter renders at /match/:code — wait for draft UI content
  await page.waitForURL('**/match/*', { timeout: 10_000 });
  await waitForPhase(page, 'draft');
}

/**
 * Wait for a phase by detecting its characteristic UI content.
 * No longer relies on URL sub-paths since PhaseRouter uses a single URL.
 */
export async function waitForPhase(
  page: Page,
  phase: 'draft' | 'forge' | 'duel' | 'adapt' | 'result',
): Promise<void> {
  switch (phase) {
    case 'draft':
      await expect(
        page.getByText(/YOUR PICK|AI PICKING|OPPONENT/i).first()
      ).toBeVisible({ timeout: 30_000 });
      break;
    case 'forge':
      await expect(
        page.getByText(/FORGE PHASE/i)
      ).toBeVisible({ timeout: 30_000 });
      break;
    case 'duel':
      await expect(
        page.getByRole('button', { name: 'Skip' })
      ).toBeVisible({ timeout: 30_000 });
      break;
    case 'adapt':
      await expect(
        page.getByText(/Adapt Phase/i)
      ).toBeVisible({ timeout: 30_000 });
      break;
    case 'result':
      await expect(
        page.getByText(/VICTORY|DEFEAT|DRAW|Victory|Defeat|Draw/)
      ).toBeVisible({ timeout: 30_000 });
      break;
  }
}

/**
 * Detect which phase is currently displayed by checking UI content.
 */
export async function getCurrentPhase(page: Page): Promise<string> {
  if (await page.getByText(/FORGE PHASE/i).isVisible().catch(() => false)) return 'forge';
  if (await page.getByRole('button', { name: 'Skip' }).isVisible().catch(() => false)) return 'duel';
  if (await page.getByText(/VICTORY|DEFEAT|DRAW/i).isVisible().catch(() => false)) return 'result';
  if (await page.getByText(/YOUR PICK|AI PICKING|OPPONENT/i).first().isVisible().catch(() => false)) return 'draft';
  if (await page.getByText(/Adapt Phase/i).isVisible().catch(() => false)) return 'adapt';
  return 'unknown';
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
  // Keep picking until the forge phase appears
  for (let attempts = 0; attempts < 40; attempts++) {
    const currentPhase = await getCurrentPhase(page);
    if (currentPhase !== 'draft') return;

    const isOurTurn = await page.getByText(/YOUR PICK|Your Turn/i).isVisible({ timeout: 1000 }).catch(() => false);
    if (isOurTurn) {
      await pickOrb(page);
    }
    await page.waitForTimeout(600);
  }
}

export async function placeOrbs(page: Page): Promise<void> {
  // Try GemCard-based stockpile first ([data-gem]), fall back to OrbIcon buttons
  for (let i = 0; i < 3; i++) {
    const gems = page.locator('[data-gem]');
    const stockpileOrbs = page.locator('button[title*="(T"]:not([disabled])');
    const gemCount = await gems.count();
    const orbCount = await stockpileOrbs.count();

    if (gemCount === 0 && orbCount === 0) break;

    // Click orb/gem to select it
    try {
      if (gemCount > 0) {
        await gems.first().click({ timeout: 3000 });
      } else {
        await stockpileOrbs.first().click({ timeout: 3000 });
      }
    } catch {
      break; // Not clickable, stop trying
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

  // If a confirmation modal appears, click CONFIRM
  const confirmBtn = page.getByRole('button', { name: 'CONFIRM' });
  const hasConfirm = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (hasConfirm) {
    await confirmBtn.click();
  }

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
