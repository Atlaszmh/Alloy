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
        <div class="app-frame" style="width: 375px; height: 667px;"></div>
      </body></html>
    `);
    const findings = await overflowX(page, CTX);
    expect(findings).toEqual([]);
  });

  test('detects element wider than viewport', async ({ page }) => {
    await page.setViewportSize({ width: VP.width, height: VP.height });
    await page.setContent(`
      <html><body style="margin:0">
        <div class="app-frame" style="width: 375px; height: 667px;"></div>
        <div id="bad" style="width: 9999px; height: 10px; background: red;"></div>
      </body></html>
    `);
    const findings = await overflowX(page, CTX);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toMatchObject({
      probe: 'overflow-x',
      severity: 'fail',
    });
    expect(findings[0].detail).toContain('#bad');
  });
});
