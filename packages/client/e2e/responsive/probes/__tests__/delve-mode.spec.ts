import { test, expect } from '@playwright/test';
import { minSize } from '../min-size';
import { pageScroll } from '../overflow';
import { tabBarVisibility } from '../tabbar';
import { PC_VIEWPORTS } from '../../viewports';

const VP = PC_VIEWPORTS[0]; // hd-720
const CTX = { screen: 'test', viewport: VP, delve: {} };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VP.width, height: VP.height });
});

const frame = (body: string) => `
  <html><body style="margin:0;overflow:hidden">
    <div class="app-frame" style="width:1280px;height:720px;position:relative;overflow:hidden">${body}</div>
  </body></html>`;

test('tabbar: a Delve screen has none', async ({ page }) => {
  await page.setContent(frame(''));
  expect(await tabBarVisibility(page, CTX)).toEqual([]);
  await page.setContent(frame('<div data-tabbar style="height:20px"></div>'));
  expect((await tabBarVisibility(page, CTX))[0]?.severity).toBe('fail');
});

test('min-size: 14 design px under the 0.75 zoom passes, 12 fails', async ({ page }) => {
  await page.setContent(frame(`
    <div style="zoom:0.75">
      <span id="ok" style="font-size:14px">ok</span>
      <button id="big" style="width:32px;height:32px">A</button>
    </div>`));
  expect(await minSize(page, CTX)).toEqual([]);
  await page.setContent(frame(`
    <div style="zoom:0.75"><span id="small" style="font-size:12px">small</span></div>`));
  const findings = await minSize(page, CTX);
  expect(findings.some((f) => f.detail.includes('#small') && f.severity === 'fail')).toBe(true);
});

test('min-size: a click target under 24×24 fails, a hidden one is skipped', async ({ page }) => {
  await page.setContent(frame(`
    <button id="tiny" style="width:20px;height:30px;font-size:14px">x</button>
    <button style="width:10px;height:10px;font-size:14px;visibility:hidden">y</button>`));
  const findings = await minSize(page, CTX);
  expect(findings.map((f) => f.detail)).toEqual([expect.stringContaining('#tiny')]);
});

test('page-scroll: a tall page fails; a control cut off fails unless a pane scrolls it', async ({
  page,
}) => {
  await page.setContent(`<html><body style="margin:0"><div class="app-frame" style="height:2000px"></div></body></html>`);
  expect((await pageScroll(page, CTX)).some((f) => f.detail.includes('the page scrolls'))).toBe(true);

  await page.setContent(frame(`
    <div style="height:100px;overflow:hidden"><div style="height:200px"></div><button data-testid="cut">x</button></div>`));
  expect((await pageScroll(page, CTX)).some((f) => f.detail.includes('cut'))).toBe(true);

  await page.setContent(frame(`
    <div style="height:100px;overflow:auto"><div style="height:200px"></div><button>x</button></div>`));
  expect(await pageScroll(page, CTX)).toEqual([]);
});
