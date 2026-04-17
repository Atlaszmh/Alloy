import type { Page } from '@playwright/test';
import type { Finding, ProbeCtx } from './types';
import { overflowX, overflowY } from './overflow';
import { tabBarVisibility } from './tabbar';
import { primaryActionReachable } from './reachability';
import { deadSpace, type DeadSpaceOptions } from './dead-space';
import { minSize } from './min-size';

export interface ProbeOverrides {
  deadSpace?: DeadSpaceOptions;
}

const FRAME_MISSING_PROBE = 'frame-missing';

export async function runAllProbes(
  page: Page,
  ctx: ProbeCtx,
  overrides?: ProbeOverrides,
): Promise<Finding[]> {
  const frameExists = await page.evaluate(() =>
    Boolean(document.querySelector('.app-frame')),
  );
  if (!frameExists) {
    return [{
      screen: ctx.screen,
      viewport: ctx.viewport.name,
      probe: FRAME_MISSING_PROBE,
      severity: 'fail',
      detail: '.app-frame element not present at probe time',
    }];
  }

  const probes = [
    { name: 'overflow-x', fn: overflowX },
    { name: 'overflow-y', fn: overflowY },
    { name: 'tabbar-visibility', fn: tabBarVisibility },
    { name: 'primary-action-reachable', fn: primaryActionReachable },
    { name: 'dead-space', fn: deadSpace(overrides?.deadSpace ?? {}) },
    { name: 'min-size', fn: minSize },
  ];

  const all: Finding[] = [];
  for (const { name, fn } of probes) {
    try {
      const findings = await fn(page, ctx);
      all.push(...findings);
    } catch (err) {
      all.push({
        screen: ctx.screen,
        viewport: ctx.viewport.name,
        probe: `${name}-error`,
        severity: 'fail',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return all;
}
