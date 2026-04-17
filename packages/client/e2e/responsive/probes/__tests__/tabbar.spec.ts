import { test, expect } from '@playwright/test';
import { tabBarVisibility } from '../tabbar';
import { VIEWPORTS } from '../../viewports';

const VP = VIEWPORTS[1];
const CTX = { screen: 'test', viewport: VP };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VP.width, height: VP.height });
});

test('clean: tab bar visible, primary action above it → no findings', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width: 375px; height: 667px; position: relative;">
        <button data-primary-action style="position:absolute; top: 100px; width: 100px; height: 40px;">CTA</button>
        <div data-tabbar style="position:absolute; bottom:0; left:0; right:0; height: 50px; background:#222;"></div>
      </div>
    </body></html>
  `);
  expect(await tabBarVisibility(page, CTX)).toEqual([]);
});

test('fail: tab bar missing → finding with probe=tabbar-visibility', async ({ page }) => {
  await page.setContent(`
    <html><body><div class="app-frame" style="width:375px;height:667px"></div></body></html>
  `);
  const findings = await tabBarVisibility(page, CTX);
  expect(findings.length).toBeGreaterThan(0);
  expect(findings[0].probe).toBe('tabbar-visibility');
  expect(findings[0].detail).toMatch(/missing|not found/i);
});

test('fail: primary action overlaps tab bar', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width: 375px; height: 667px; position: relative;">
        <button data-primary-action style="position:absolute; bottom: 10px; left:10px; width: 100px; height: 40px;">CTA</button>
        <div data-tabbar style="position:absolute; bottom:0; left:0; right:0; height: 50px; background:#222;"></div>
      </div>
    </body></html>
  `);
  const findings = await tabBarVisibility(page, CTX);
  expect(findings.some(f => f.detail.match(/overlap/i))).toBe(true);
});
