import { test, expect, type Page } from '@playwright/test';
import { createDefaultRegistry, createDelveProfile } from '@alloy/engine';

/**
 * Controller support with a fake standard-mapping pad: Playwright has no real
 * gamepad, so `navigator.getGamepads` returns `window.__pad`, which the test
 * presses by hand.
 */

const BUTTON = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, menu: 9, up: 12, down: 13 } as const;

async function setup(page: Page, autopilot: boolean): Promise<void> {
  const save = JSON.stringify(createDelveProfile(createDefaultRegistry(), 4242));
  await page.addInitScript(
    ([value, bot]) => {
      const w = window as unknown as { __pad: unknown };
      w.__pad = {
        connected: true,
        mapping: 'standard',
        index: 0,
        id: 'Fake Xbox controller',
        timestamp: 0,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: null,
      };
      navigator.getGamepads = () => [w.__pad as Gamepad];
      if (sessionStorage.getItem('pad-e2e')) return;
      localStorage.clear();
      localStorage.setItem('alloy:delve:v2', value);
      if (bot) localStorage.setItem('alloy:delve:autopilot', '1');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('pad-e2e', '1');
    },
    [save, autopilot] as const,
  );
}

/** Wait for the page to draw `n` frames (the controller is read once per frame). */
async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const step = (left: number) =>
          left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
        step(count);
      }),
    n,
  );
}

/**
 * Press and release within the page, across one frame: the controller is read
 * once per frame, so it sees exactly one press (a longer hold can trigger the
 * D-pad's repeat when frames are slow under load).
 */
async function tap(page: Page, button: number): Promise<void> {
  await page.evaluate(
    (i) =>
      new Promise<void>((resolve) => {
        const pad = (
          window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }
        ).__pad;
        pad.buttons[i] = { pressed: true, value: 1 };
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            pad.buttons[i] = { pressed: false, value: 0 };
            resolve();
          }),
        );
      }),
    button,
  );
  await frames(page, 2);
}

test.describe('Delve with a controller', () => {
  test('G01: Menu opens the dive menu; D-pad and A toggle a setting; B resumes', async ({
    page,
  }) => {
    await setup(page, true);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('delve-run')).toBeVisible();

    await tap(page, BUTTON.menu);
    const toggle = page.getByTestId('attack-mode-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Auto');
    await tap(page, BUTTON.down);
    await expect(toggle).toBeFocused();
    await tap(page, BUTTON.a);
    await expect(toggle).toContainText('Manual');
    await tap(page, BUTTON.b);
    await expect(toggle).toBeHidden();
  });

  test('G02: A dodges, and the hints switch to the controller', async ({ page }) => {
    await setup(page, false);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    const dodge = page.getByTestId('dodge-button');
    await expect(dodge).toHaveAttribute('data-charges', '2');
    await tap(page, BUTTON.a);
    await expect(dodge).toHaveAttribute('data-charges', '1');
    await expect(dodge).toContainText('A');
  });

  test('G03: RB and LB step through the Anvil tabs', async ({ page }) => {
    await setup(page, true);
    await page.goto('/delve');
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-abilities')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.lb);
    await expect(page.getByTestId('tab-bag')).toHaveAttribute('aria-selected', 'true');
  });
});
