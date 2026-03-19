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
  getCurrentPhase,
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

    // Go back and use startMatch for seed injection
    await page.goto('/');
    await startMatch(page);

    // ── 03: Draft Start ──
    await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible();
    await screenshotFlow(page, vp, 'match-flow', '03-draft-start');

    // ── 04: Draft Mid ──
    for (let i = 0; i < 3; i++) {
      const isOurTurn = await page.getByText(/YOUR PICK|Your Turn/i).isVisible().catch(() => false);
      if (isOurTurn) {
        await pickOrb(page);
      }
      await page.waitForTimeout(700);
    }
    const phaseAfterPicks = await getCurrentPhase(page);
    if (phaseAfterPicks === 'draft') {
      await screenshotFlow(page, vp, 'match-flow', '04-draft-mid');
    }

    // ── 05: Draft Complete → transitions to forge ──
    await completeDraft(page);
    await screenshotFlow(page, vp, 'match-flow', '05-draft-complete');

    // ════════════ ROUND 1 ════════════

    // ── 06: Forge R1 Weapon ──
    await waitForPhase(page, 'forge');
    await expect(page.getByText('FORGE PHASE')).toBeVisible();
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
    const weaponTab = page.getByRole('button', { name: /weapon/i });
    if (await weaponTab.isVisible().catch(() => false)) {
      await weaponTab.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'match-flow', '08-forge-r1-synergies');

    // Complete forge R1
    await completeForge(page);

    // ── 09: Duel R1 Canvas ──
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible({ timeout: 10_000 });
    await skipDuel(page);
    await screenshotFlow(page, vp, 'match-flow', '09-duel-r1-canvas');

    // ── 10: Duel R1 Text Log ──
    const textViewBtn = page.getByRole('button', { name: 'Text View' });
    if (await textViewBtn.isVisible().catch(() => false)) {
      await textViewBtn.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'match-flow', '10-duel-r1-textlog');

    // ── 11: Duel R1 Breakdown ──
    const visualViewBtn = page.getByRole('button', { name: 'Visual View' });
    if (await visualViewBtn.isVisible().catch(() => false)) {
      await visualViewBtn.click();
      await page.waitForTimeout(300);
    }
    await screenshotFlow(page, vp, 'match-flow', '11-duel-r1-breakdown');

    await continuePastDuel(page);

    // ════════════ ROUND 2 ════════════

    // ── 12: Draft R2 ──
    await waitForPhase(page, 'draft');
    await screenshotFlow(page, vp, 'match-flow', '12-draft-r2');
    await completeDraft(page);

    // ── 13: Forge R2 ──
    await waitForPhase(page, 'forge');
    await placeOrbs(page);
    await screenshotFlow(page, vp, 'match-flow', '13-forge-r2');
    await completeForge(page);

    // ── 14: Duel R2 Canvas ──
    await skipDuel(page);
    await screenshotFlow(page, vp, 'match-flow', '14-duel-r2-canvas');

    // ── 15: Duel R2 Breakdown ──
    await screenshotFlow(page, vp, 'match-flow', '15-duel-r2-breakdown');
    await continuePastDuel(page);

    // ════════════ ROUND 3 (if needed) ════════════

    // Wait a moment for phase to settle
    await page.waitForTimeout(1000);
    const phaseAfterR2 = await getCurrentPhase(page);

    if (phaseAfterR2 === 'draft') {
      // ── 16: Draft R3 ──
      await screenshotFlow(page, vp, 'match-flow', '16-draft-r3');
      await completeDraft(page);

      // ── 17: Forge R3 ──
      await waitForPhase(page, 'forge');
      await placeOrbs(page);
      await screenshotFlow(page, vp, 'match-flow', '17-forge-r3');
      await completeForge(page);

      // ── 18: Duel R3 Canvas ──
      await skipDuel(page);
      await screenshotFlow(page, vp, 'match-flow', '18-duel-r3-canvas');

      // ── 19: Duel R3 Breakdown ──
      await screenshotFlow(page, vp, 'match-flow', '19-duel-r3-breakdown');
      await continuePastDuel(page);
    }

    // ════════════ POST MATCH ════════════

    // ── 20: Post Match ──
    await waitForPhase(page, 'result');
    await expect(page.getByText(/VICTORY|DEFEAT|DRAW|Victory|Defeat|Draw/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Main Menu' })).toBeVisible();
    await screenshotFlow(page, vp, 'match-flow', '20-post-match');

    // Verify Play Again navigates back to matchmaking
    await page.getByRole('button', { name: 'Play Again' }).click();
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/queue');
  });
});
