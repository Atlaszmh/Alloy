import { test, expect } from '@playwright/test';
import { primaryActionReachable } from '../reachability';
import { VIEWPORTS } from '../../viewports';

const VP = VIEWPORTS[1];
const CTX = { screen: 'test', viewport: VP };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VP.width, height: VP.height });
});

test('clean: 40x40 primary action on-screen → no findings', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <button data-primary-action style="width:40px;height:40px">OK</button>
      </div>
    </body></html>
  `);
  expect(await primaryActionReachable(page, CTX)).toEqual([]);
});

test('warn-but-no-fail when no primary action present', async ({ page }) => {
  await page.setContent(`
    <html><body><div class="app-frame" style="width:375px;height:667px"></div></body></html>
  `);
  const findings = await primaryActionReachable(page, CTX);
  expect(findings.length).toBe(1);
  expect(findings[0].severity).toBe('warn');
});

test('fail: action below 36px touch target', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <button data-primary-action style="width:20px;height:20px">x</button>
      </div>
    </body></html>
  `);
  const findings = await primaryActionReachable(page, CTX);
  expect(findings.some(f => f.severity === 'fail' && f.detail.match(/touch.*target|too small/i))).toBe(true);
});

test('fail: action off-screen', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px;position:relative">
        <button data-primary-action style="position:absolute;top:9999px;width:40px;height:40px">x</button>
      </div>
    </body></html>
  `);
  const findings = await primaryActionReachable(page, CTX);
  expect(findings.some(f => f.severity === 'fail' && f.detail.match(/off-?screen|outside viewport/i))).toBe(true);
});
