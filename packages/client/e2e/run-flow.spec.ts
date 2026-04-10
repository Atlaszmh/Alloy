import { test, expect } from '@playwright/test';

// Run flow E2E tests - placeholder until run mode UI is fully wired
// These tests will verify the run-based game loop once PhaseRouter supports it

test.describe('Run Flow', () => {
  // R01: Start run, select weapon/armor, first forge
  test.skip('R01: start run shows weapon/armor selection in first forge', async ({ page }) => {
    // TODO: Navigate to run mode, verify weapon/armor picker appears before forge grid
  });

  // R02: Draft pool shows only Common/Magic gems in round 1
  test.skip('R02: round 1 draft pool has only common and magic gems', async ({ page }) => {
    // TODO: Start run, verify gem cards show only common/magic rarity indicators
  });

  // R03-R10: Additional run flow tests
  test.skip('R03: combine two gems produces result in stockpile', async () => {});
  test.skip('R04: socket and unsocket gems freely', async () => {});
  test.skip('R05: losing duel decrements life counter', async () => {});
  test.skip('R06: losing all lives shows run-over screen', async () => {});
  test.skip('R07: win streak restores a life', async () => {});
  test.skip('R08: reaching round 10 shows run-won state', async () => {});
  test.skip('R09: round 11 enters endless mode', async () => {});
  test.skip('R10: later rounds show higher quality gems', async () => {});
});
