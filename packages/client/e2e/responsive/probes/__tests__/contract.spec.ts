import { test, expect } from '../../fixtures/responsive-fixture';
import { VIEWPORTS } from '../../viewports';
import { readReport } from '../report';

test('contract: stubbed probes produce no findings, fixture writes empty report', async ({
  page,
  runProbes,
}) => {
  await page.setContent(`
    <!doctype html>
    <html><body style="margin:0">
      <div class="app-frame" style="width: 100px; height: 100px; position: relative;">
        <div data-tabbar style="position:absolute;bottom:0;left:0;right:0;height:20px;background:#222"></div>
      </div>
    </body></html>
  `);
  const vp = VIEWPORTS[0];
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await runProbes('contract-smoke', vp);

  const findings = readReport();
  const fails = findings.filter(f => f.severity === 'fail');
  expect(fails.length).toBe(0);
});
