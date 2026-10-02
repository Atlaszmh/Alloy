import { test, expect } from '@playwright/test';
import { minSize } from '../min-size';
import { pageScroll } from '../overflow';
import { primaryActionReachable } from '../reachability';
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

test('min-size: a form control and display:contents text take the floor too', async ({ page }) => {
  await page.setContent(frame(`
    <div style="zoom:0.75">
      <select id="ok" style="font-size:14px;height:32px"><option>ok</option></select>
      <span style="display:contents;font-size:14px">fine</span>
    </div>`));
  expect(await minSize(page, CTX)).toEqual([]);
  await page.setContent(frame(`
    <div style="zoom:0.75">
      <select id="small" style="font-size:12px;height:32px"><option>small</option></select>
      <input id="field" value="v" style="font-size:12px;height:32px">
      <span id="contents" style="display:contents;font-size:12px">tiny</span>
    </div>`));
  const details = (await minSize(page, CTX)).map((f) => f.detail);
  for (const id of ['#small', '#field', '#contents']) {
    expect(details.some((d) => d.startsWith(`${id} text`))).toBe(true);
  }
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

test('page-scroll: a scrolling pane cut off by its parent fails, and so does one that only clips', async ({
  page,
}) => {
  // A 300 px pane in a 100 px overflow:hidden box (the missing min-h-0): its bottom is out of reach.
  await page.setContent(frame(`
    <div style="height:100px;overflow:hidden">
      <div data-testid="pane" style="height:300px;overflow:auto"><div style="height:400px"></div><button>x</button></div>
    </div>`));
  expect((await pageScroll(page, CTX)).some((f) => f.detail.includes('scrolling pane [data-testid="pane"]'))).toBe(true);
  // The same pane grown to its content: it can't scroll, so it only clips, and the button is cut.
  await page.setContent(frame(`
    <div style="height:100px;overflow:hidden">
      <div style="overflow:auto"><div style="height:280px"></div><button data-testid="cut">x</button></div>
    </div>`));
  expect((await pageScroll(page, CTX)).some((f) => f.detail.includes('[data-testid="cut"]'))).toBe(true);
  // overflow-x:hidden alone computes overflow-y to auto, but a box that doesn't overflow can't scroll.
  await page.setContent(frame(`
    <div style="height:100px;overflow:hidden">
      <div style="overflow-x:hidden"><div style="height:200px"></div><button data-testid="cut">x</button></div>
    </div>`));
  expect((await pageScroll(page, CTX)).some((f) => f.detail.includes('[data-testid="cut"]'))).toBe(true);
});

test('reachability: a Delve primary action takes the 24 px click floor, not the 36 px touch one', async ({
  page,
}) => {
  await page.setContent(frame('<button data-primary-action style="width:100px;height:30px">Delve</button>'));
  expect(await primaryActionReachable(page, CTX)).toEqual([]);
  await page.setContent(frame('<button data-primary-action style="width:100px;height:20px">Delve</button>'));
  expect((await primaryActionReachable(page, CTX))[0]?.severity).toBe('fail');
});

test('reachability: no primary action is a skip over the arena, a warning elsewhere', async ({ page }) => {
  await page.setContent(frame(''));
  expect(await primaryActionReachable(page, { ...CTX, delve: { arena: true } })).toEqual([]);
  expect((await primaryActionReachable(page, CTX))[0]?.severity).toBe('warn');
});
