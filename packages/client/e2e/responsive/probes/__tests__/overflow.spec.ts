import { test, expect } from '@playwright/test';
import { overflowX, overflowY } from '../overflow';
import { VIEWPORTS } from '../../viewports';

const VP = VIEWPORTS[1]; // iphone-se 375x667
const CTX = { screen: 'test', viewport: VP };

test.describe('overflowX', () => {
  test('clean fixture produces no findings', async ({ page }) => {
    await page.setViewportSize({ width: VP.width, height: VP.height });
    await page.setContent(`
      <html><body style="margin:0">
        <div class="app-frame" style="width: 375px; height: 667px; position: relative;"></div>
      </body></html>
    `);
    const findings = await overflowX(page, CTX);
    expect(findings).toEqual([]);
  });

  test('returns no findings when .app-frame is missing (run-all handles it)', async ({ page }) => {
    await page.setViewportSize({ width: VP.width, height: VP.height });
    await page.setContent(`
      <html><body style="margin:0">
        <div style="width: 100px; height: 100px;"></div>
      </body></html>
    `);
    const findings = await overflowX(page, CTX);
    expect(findings).toEqual([]);
  });

  test('detects descendant spilling past .app-frame right (frame narrower than viewport)', async ({ page }) => {
    // Simulate desktop: viewport wider than frame. Frame is locked to a
    // narrower inner width and content inside overflows it horizontally.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(`
      <html><body style="margin:0">
        <div class="app-frame" style="width: 450px; height: 800px; position: relative; overflow: visible;">
          <div id="bad" style="position: absolute; left: 0; top: 0; width: 700px; height: 50px; background: red;"></div>
        </div>
      </body></html>
    `);
    const findings = await overflowX(page, { screen: 'test', viewport: { name: 'fhd', width: 1280, height: 800 } });
    const primary = findings.find(f => f.probe === 'overflow-x');
    expect(primary).toBeTruthy();
    expect(primary!.severity).toBe('fail');
    expect(primary!.detail).toContain('#bad');
    expect(primary!.detail).toContain('.app-frame right');
  });

  test('ignores descendants clipped by an ancestor with overflow-x:hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(`
      <html><body style="margin:0">
        <div class="app-frame" style="width: 450px; height: 800px; position: relative; overflow: visible;">
          <div style="width: 450px; height: 100px; overflow-x: hidden;">
            <div id="inner" style="width: 2000px; height: 50px; background: blue;"></div>
          </div>
        </div>
      </body></html>
    `);
    const findings = await overflowX(page, { screen: 'test', viewport: { name: 'fhd', width: 1280, height: 800 } });
    const primary = findings.filter(f => f.probe === 'overflow-x');
    expect(primary).toEqual([]);
  });

  test('secondary overflow-x-doc catches body-level horizontal scroll bleed', async ({ page }) => {
    // A sibling of the frame pushing the document wider than the viewport
    // (e.g., a portal/toast layer escaping the frame). Frame is clean; doc is not.
    await page.setViewportSize({ width: VP.width, height: VP.height });
    await page.setContent(`
      <html><body style="margin:0; overflow-x: visible;">
        <div class="app-frame" style="width: 375px; height: 667px; position: relative;"></div>
        <div id="escape" style="width: 9999px; height: 5px; background: red;"></div>
      </body></html>
    `);
    const findings = await overflowX(page, CTX);
    const docFinding = findings.find(f => f.probe === 'overflow-x-doc');
    expect(docFinding).toBeTruthy();
    expect(docFinding!.severity).toBe('fail');
    expect(docFinding!.detail).toContain('documentElement.scrollWidth');
  });
});

test.describe('overflowY', () => {
  test('clean fixture produces no findings', async ({ page }) => {
    await page.setViewportSize({ width: VP.width, height: VP.height });
    await page.setContent(`
      <html><body style="margin:0">
        <div class="app-frame" style="width: 375px; height: 667px; position: relative;">
          <div id="ok" style="width: 100px; height: 50px; background: green;"></div>
        </div>
      </body></html>
    `);
    const findings = await overflowY(page, CTX);
    expect(findings).toEqual([]);
  });

  test('detects descendant spilling past .app-frame bottom', async ({ page }) => {
    await page.setViewportSize({ width: VP.width, height: VP.height });
    await page.setContent(`
      <html><body style="margin:0">
        <div class="app-frame" style="width: 375px; height: 667px; position: relative; overflow: visible;">
          <div id="bad" style="position: absolute; top: 700px; width: 100px; height: 50px; background: red;"></div>
        </div>
      </body></html>
    `);
    const findings = await overflowY(page, CTX);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toMatchObject({
      probe: 'overflow-y',
      severity: 'fail',
    });
    expect(findings[0].detail).toContain('#bad');
  });
});
