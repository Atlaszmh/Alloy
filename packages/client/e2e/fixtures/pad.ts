import type { Page } from '@playwright/test';

/**
 * A fake standard-mapping pad for E2E: Playwright has no real gamepad, so `navigator.getGamepads`
 * returns `window.__pad`, which the test presses by hand.
 */

/** The standard mapping's button indices. */
export const BUTTON = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  view: 8,
  menu: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** Install the pad on every page load (an init script; nothing else). It rests until pressed, so it claims no input lock. */
export async function installPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
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
  });
}

/** Wait for the page to draw `n` frames (the controller is read once per frame). */
export async function frames(page: Page, n: number): Promise<void> {
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
 * Press and release within the page, across one frame, so the controller sees exactly one press
 * (a longer hold can trigger the D-pad's repeat when frames are slow under load).
 */
export async function tap(page: Page, button: number): Promise<void> {
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
