import { test as base } from '@playwright/test';
import { runAllProbes, type ProbeOverrides } from '../probes/run-all';
import { appendFinding } from '../probes/report';
import type { Viewport } from '../viewports';

export interface RunProbesOptions {
  /** Per-probe threshold overrides (e.g., { deadSpace: { minRatio: 0.6 } }). */
  overrides?: ProbeOverrides;
}

export type RunProbes = (
  screen: string,
  vp: Viewport,
  options?: RunProbesOptions,
) => Promise<void>;

export const test = base.extend<{ runProbes: RunProbes }>({
  runProbes: async ({ page }, use) => {
    await use(async (screen, vp, options) => {
      const findings = await runAllProbes(
        page,
        { screen, viewport: vp },
        options?.overrides,
      );
      findings.forEach(appendFinding);
      const failures = findings.filter((f) => f.severity === 'fail');
      if (failures.length > 0) {
        throw new Error(
          `Responsive violations on ${screen} @ ${vp.name}:\n` +
            failures.map((f) => `  [${f.probe}] ${f.detail}`).join('\n'),
        );
      }
    });
  },
});

export { expect } from '@playwright/test';
