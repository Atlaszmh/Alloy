import type { Page } from '@playwright/test';
import type { Viewport } from '../viewports';

export type Severity = 'fail' | 'warn';

export interface Finding {
  screen: string;
  viewport: string;
  probe: string;
  severity: Severity;
  detail: string;
  measured?: number;
  expected?: number;
}

export interface ProbeCtx {
  screen: string;
  viewport: Viewport;
}

export type Probe = (page: Page, ctx: ProbeCtx) => Promise<Finding[]>;
