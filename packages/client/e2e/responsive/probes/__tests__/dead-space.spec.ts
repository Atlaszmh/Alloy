import { test, expect } from '@playwright/test';
import { deadSpace } from '../dead-space';
import { VIEWPORTS } from '../../viewports';

const VP = VIEWPORTS[1];
const CTX = { screen: 'test', viewport: VP };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VP.width, height: VP.height });
});

test('clean: sections sum to 90% of frame → no findings', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:600px">
        <div data-screen-section style="height:300px"></div>
        <div data-screen-section style="height:240px"></div>
      </div>
    </body></html>
  `);
  expect(await deadSpace()(page, CTX)).toEqual([]);
});

test('fail: sections sum to 50% → finding', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:600px">
        <div data-screen-section style="height:300px"></div>
      </div>
    </body></html>
  `);
  const findings = await deadSpace()(page, CTX);
  expect(findings.length).toBe(1);
  expect(findings[0]).toMatchObject({ probe: 'dead-space', severity: 'fail' });
  expect(findings[0].measured).toBeLessThan(0.55);
});

test('respects override: 0.4 threshold accepts 50% fill', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:600px">
        <div data-screen-section style="height:300px"></div>
      </div>
    </body></html>
  `);
  expect(await deadSpace({ minRatio: 0.4 })(page, CTX)).toEqual([]);
});

test('warns when no [data-screen-section] markers present', async ({ page }) => {
  await page.setContent(`
    <html><body><div class="app-frame" style="width:375px;height:600px"></div></body></html>
  `);
  const findings = await deadSpace()(page, CTX);
  expect(findings.length).toBe(1);
  expect(findings[0].severity).toBe('warn');
});
