import { test, expect } from '@playwright/test';
import { minSize } from '../min-size';
import { VIEWPORTS } from '../../viewports';

const VP = VIEWPORTS[1];
const CTX = { screen: 'test', viewport: VP };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VP.width, height: VP.height });
});

test('clean: gem at 80px, socket at 40px, text at 12px → no findings', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <div data-gem style="width:80px;height:80px"></div>
        <div class="forge-socket" style="width:40px;height:40px"></div>
        <div data-screen-section><span style="font-size:12px">hi</span></div>
      </div>
    </body></html>
  `);
  expect(await minSize(page, CTX)).toEqual([]);
});

test('fail: gem below 80px floor', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <div data-gem id="tiny-gem" style="width:50px;height:50px"></div>
      </div>
    </body></html>
  `);
  const findings = await minSize(page, CTX);
  expect(findings.some(f => f.detail.includes('gem') && f.severity === 'fail')).toBe(true);
});

test('fail: socket below 40px floor', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <div class="forge-socket" id="tiny-sock" style="width:20px;height:20px"></div>
      </div>
    </body></html>
  `);
  const findings = await minSize(page, CTX);
  expect(findings.some(f => f.detail.includes('socket') && f.severity === 'fail')).toBe(true);
});

test('fail: text below 8px floor inside [data-screen-section]', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <div data-screen-section><span style="font-size:6px">tiny</span></div>
      </div>
    </body></html>
  `);
  const findings = await minSize(page, CTX);
  expect(findings.some(f => f.detail.includes('font-size') && f.severity === 'fail')).toBe(true);
});
