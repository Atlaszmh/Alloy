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
      <div class="app-frame" style="width: 100px; height: 100px; position: relative;"></div>
    </body></html>
  `);
  const vp = VIEWPORTS[0];
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await runProbes('contract-smoke', vp);

  const findings = readReport();
  const fails = findings.filter(f => f.severity === 'fail');
  expect(fails.length).toBe(0);
});
