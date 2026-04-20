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

  // Matchmaking flow: Play → Play vs AI → Choose AI Tier
  await page.waitForURL('**/queue', { timeout: 5000 });
  // Wait for queue page content to render
  const playVsAi = page.getByRole('button', { name: 'Play vs AI' });
  await expect(playVsAi).toBeVisible({ timeout: 5000 });
  await playVsAi.click();
  await expect(page.getByText('Choose AI Tier')).toBeVisible({ timeout: 5000 });

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
  phase: 'draft' | 'forge' | 'duel' | 'result',
): Promise<void> {
  switch (phase) {
    case 'draft':
      // Match draft-specific headers: "YOUR PICK" / "OPPONENT PICKING" (versus modes)
      // or "PICK YOUR GEMS" (run mode). Deliberately avoid a bare /OPPONENT/ which
      // collides with "searching for an opponent" on the matchmaking screen.
      await expect(
        page.getByText(/YOUR PICK|OPPONENT PICKING|AI PICKING|PICK YOUR GEMS/i).first()
      ).toBeVisible({ timeout: 30_000 });
      break;
    case 'forge':
      // "FORGE PHASE" shows in ForgeHeader AFTER item selection. The
      // BaseItemSelector modal ("Choose your weapon/armor") renders instead
      // while itemSelectionPhase !== 'done' and hides the header entirely.
      // Treat either state as "forge phase reached" so callers can then
      // invoke completeForgeItemSelection() to dismiss the modal.
      await expect(
        page.getByText(/FORGE PHASE|Choose your (weapon|armor)/i).first()
      ).toBeVisible({ timeout: 30_000 });
      break;
    case 'duel':
      await expect(
        page.getByRole('button', { name: 'Skip' })
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
  // BaseItemSelector renders in place of the forge UI at the start of the forge phase.
  if (await page.getByText(/Choose your (weapon|armor)/i).isVisible().catch(() => false)) return 'forge';
  if (await page.getByRole('button', { name: 'Skip' }).isVisible().catch(() => false)) return 'duel';
  if (await page.getByText(/VICTORY|DEFEAT|DRAW/i).isVisible().catch(() => false)) return 'result';
  if (await page.getByText(/YOUR PICK|OPPONENT PICKING|AI PICKING|PICK YOUR GEMS/i).first().isVisible().catch(() => false)) return 'draft';
  return 'unknown';
}

export async function pickGem(page: Page): Promise<void> {
  const gems = page.locator('[data-gem]');
  const count = await gems.count();
  if (count === 0) return;

  // First tap: select. Catch detachments (some modes confirm on single tap and
  // the gem starts swooping out mid-click).
  try {
    await gems.first().click({ timeout: 2_000 });
  } catch {
    return;
  }
  await page.waitForTimeout(300);

  // If the pool already shrank, the first tap was sufficient (single-tap pick path).
  const afterFirst = await gems.count();
  if (afterFirst < count) return;

  // Otherwise second tap confirms the pick. Still swallow detachment errors —
  // the swoop animation begins immediately after pointerup.
  try {
    await gems.first().click({ timeout: 2_000 });
  } catch {
    return;
  }
  await page.waitForTimeout(300);
}

/** @deprecated Use pickGem instead */
export const pickOrb = pickGem;

export async function completeDraft(page: Page): Promise<void> {
  // Keep picking until the forge phase appears
  for (let attempts = 0; attempts < 40; attempts++) {
    const currentPhase = await getCurrentPhase(page);
    if (currentPhase !== 'draft') return;

    // Run mode drafts show "PICK YOUR GEMS" and there's no opponent turn —
    // the player picks every gem. Non-run modes show "YOUR PICK" on the player turn.
    const isOurTurn = await page.getByText(/YOUR PICK|Your Turn|PICK YOUR GEMS/i).isVisible({ timeout: 1000 }).catch(() => false);
    if (isOurTurn) {
      await pickGem(page);
    }
    await page.waitForTimeout(600);
  }
}

export async function placeGems(page: Page): Promise<void> {
  // Try GemCard-based stockpile ([data-gem])
  for (let i = 0; i < 3; i++) {
    const gems = page.locator('[data-gem]');
    const gemCount = await gems.count();

    if (gemCount === 0) break;

    // Click gem to select it
    try {
      await gems.first().click({ timeout: 3000 });
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

/** @deprecated Use placeGems instead */
export const placeOrbs = placeGems;

/**
 * Dismiss the BaseItemSelector modal (weapon → armor) that appears at the
 * start of the first forge phase in run mode. Uses the "Random" button so
 * the helper always picks a valid item without needing to know which base
 * items exist. Idempotent: no-ops if the modal is already dismissed.
 */
export async function completeForgeItemSelection(page: Page): Promise<void> {
  for (const itemType of ['weapon', 'armor'] as const) {
    const heading = page.getByText(new RegExp(`Choose your ${itemType}`, 'i'));
    const isVisible = await heading.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!isVisible) continue;

    const randomBtn = page.getByRole('button', { name: /^Random$/i });
    await expect(randomBtn).toBeVisible({ timeout: 3_000 });
    await randomBtn.click();
    // Wait for the heading to disappear before checking the next item type.
    await expect(heading).toBeHidden({ timeout: 5_000 });
  }
  // Forge content ("COMBINATION WORKBENCH", sockets, etc.) renders behind the
  // modal; give React a tick to settle after the overlay unmounts.
  await page.waitForTimeout(200);
}

export async function completeForge(page: Page): Promise<void> {
  const doneBtn = page.getByRole('button', { name: /^DONE$/i });
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

/* ------------------------------------------------------------------ */
/*  Run mode helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Start a run via the Matchmaking UI. Navigates: Main → Play → Start Run → Tier N.
 * Lands on the draft phase of round 1 with an `ai-run-*` match code.
 */
export async function startRun(page: Page, tier: 1 | 2 | 3 | 4 | 5 = 1): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();

  await page.waitForURL('**/queue', { timeout: 5000 });
  const startRunBtn = page.getByRole('button', { name: 'Start Run' });
  await expect(startRunBtn).toBeVisible({ timeout: 5000 });
  await startRunBtn.click();

  // Run-select view
  await expect(page.getByRole('heading', { name: 'Start Run' })).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: new RegExp(`Tier ${tier}`, 'i') }).click();

  await page.waitForURL('**/match/ai-run-*', { timeout: 10_000 });
  await waitForPhase(page, 'draft');
}

interface RunViaStoreOpts {
  round?: number;
  phase?: 'draft' | 'forge' | 'duel' | 'complete';
  startingLives?: number;
  goalRound?: number;
  consecutiveWins?: number;
  seed?: number;
  aiTier?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Start a run by invoking matchStore.startDebugMatch directly — bypasses the UI
 * and fast-forwards to the requested round/phase. Essential for late-round tests
 * (R07, R08) where playing through is impractical.
 */
export async function startRunViaStore(page: Page, opts: RunViaStoreOpts = {}): Promise<void> {
  const {
    round = 1,
    phase = 'forge',
    startingLives = 3,
    goalRound = 10,
    consecutiveWins = 0,
    seed = 42,
    aiTier = 1,
  } = opts;

  // Navigate first so the React tree mounts the gateway + stores.
  await page.goto('/match/ai-run-e2e');

  // Kick off the debug match from inside the page.
  await page.evaluate(
    ({ round, phase, startingLives, goalRound, consecutiveWins, seed, aiTier }) => {
      const stores = (window as { __ZUSTAND_STORES__?: Record<string, { getState: () => unknown; setState: (s: unknown) => void }> }).__ZUSTAND_STORES__;
      if (!stores?.matchStore) throw new Error('matchStore not exposed on window');
      const match = stores.matchStore.getState() as { startDebugMatch: (...args: unknown[]) => void };
      match.startDebugMatch(
        seed,
        'run_async',
        aiTier,
        phase,
        'sword',
        'chainmail',
        round,
        { startingLives, goalRound },
      );
      if (consecutiveWins > 0 && stores.runStore) {
        stores.runStore.setState({ consecutiveWins });
      }
      // Skip weapon/armor modal if we're landing on forge.
      if (phase === 'forge' && stores.forgeStore) {
        stores.forgeStore.setState({ itemSelectionPhase: 'done' });
      }
    },
    { round, phase, startingLives, goalRound, consecutiveWins, seed, aiTier },
  );

  if (phase === 'draft') await waitForPhase(page, 'draft');
  else if (phase === 'forge') await waitForPhase(page, 'forge');
  else if (phase === 'duel') await waitForPhase(page, 'duel');
}

/**
 * Skip the visible duel and force a run-round outcome by mutating runStore directly.
 * This bypasses the duel simulation — use for UI assertions on lives/status/streak
 * rather than engine-integration checks.
 */
export async function forceRunResult(page: Page, result: 'win' | 'loss'): Promise<void> {
  await page.evaluate((res) => {
    const stores = (window as { __ZUSTAND_STORES__?: Record<string, { getState: () => unknown; setState: (s: unknown) => void }> }).__ZUSTAND_STORES__;
    if (!stores?.runStore) throw new Error('runStore not exposed on window');
    const state = stores.runStore.getState() as {
      lives: number;
      consecutiveWins: number;
      round: number;
      goal: number | null;
    };
    if (res === 'loss') {
      const newLives = Math.max(0, state.lives - 1);
      stores.runStore.setState({
        lives: newLives,
        status: newLives <= 0 ? 'lost' : 'active',
        consecutiveWins: 0,
      });
    } else {
      const newStreak = state.consecutiveWins + 1;
      const recoveredLife = newStreak >= 3;
      const nextLives = recoveredLife ? Math.min(state.lives + 1, 5) : state.lives;
      const nextRound = state.round + 1;
      const goalReached = state.goal !== null && nextRound >= state.goal;
      stores.runStore.setState({
        consecutiveWins: recoveredLife ? 0 : newStreak,
        lives: nextLives,
        round: nextRound,
        status: goalReached ? 'won' : 'active',
      });
    }
  }, result);
  await page.waitForTimeout(300);
}

/**
 * Wait for a phase AND assert the current run round.
 * Read round from data-round on the round counter (set in RunRoundCounter).
 */
export async function waitForRunPhase(
  page: Page,
  phase: 'draft' | 'forge' | 'duel' | 'result',
  round?: number,
): Promise<void> {
  await waitForPhase(page, phase);
  if (round !== undefined) {
    const counter = page.locator('[data-testid="run-round-counter"]');
    await expect(counter).toHaveAttribute('data-round', String(round), { timeout: 5000 });
  }
}

/* ------------------------------------------------------------------ */
/*  Combine helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Inject a specific set of GemInstance objects into the forge plan's stockpile.
 * Gems are pushed onto the existing stockpile (not replaced).
 */
export async function setupForgeWithGems(
  page: Page,
  gems: Array<Record<string, unknown>>,
): Promise<void> {
  await page.evaluate((injected) => {
    const stores = (window as { __ZUSTAND_STORES__?: Record<string, { getState: () => unknown; setState: (s: unknown) => void }> }).__ZUSTAND_STORES__;
    if (!stores?.forgeStore) throw new Error('forgeStore not exposed on window');
    const state = stores.forgeStore.getState() as {
      plan: { stockpile: unknown[] } | null;
    };
    if (!state.plan) throw new Error('forgeStore.plan is null — call startRunViaStore first');
    state.plan.stockpile.push(...injected);
    // Trigger re-render
    stores.forgeStore.setState({ plan: { ...state.plan, stockpile: [...state.plan.stockpile] } });
  }, gems);
  await page.waitForTimeout(200);
}

/**
 * Place a gem from the stockpile into an equipment socket by directly driving
 * the forge action through the store. Selects the gem then clicks the socket.
 */
export async function tapGemToSocket(
  page: Page,
  gemUid: string,
  target: 'weapon' | 'armor',
  slotIndex: number,
): Promise<void> {
  await page.evaluate(
    ({ gemUid, target, slotIndex }) => {
      const stores = (window as { __ZUSTAND_STORES__?: Record<string, { getState: () => unknown; setState: (s: unknown) => void }> }).__ZUSTAND_STORES__;
      if (!stores?.forgeStore) throw new Error('forgeStore not exposed');
      const state = stores.forgeStore.getState() as {
        selectOrb: (uid: string | null) => void;
      };
      state.selectOrb(gemUid);
      // The UI path calls applyAction via Forge.tsx's handleSocketClick. Simulate by clicking.
      const socket = document.querySelector(
        `[data-item-card="${target}"] [data-forge-socket="${slotIndex}"]`,
      );
      if (socket instanceof HTMLElement) socket.click();
    },
    { gemUid, target, slotIndex },
  );
  await page.waitForTimeout(200);
}
