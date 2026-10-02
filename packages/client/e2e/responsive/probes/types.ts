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
  /**
   * The Delve's rules (Delve UI v1, Phase 4A): the page never scrolls (panes may), no TabBar,
   * text at least 10 CSS px and click targets at least 24×24 CSS px; `arena` skips dead space
   * and the primary action (the play is the action: no [data-primary-action] to measure).
   */
  delve?: { arena?: boolean };
}

export type Probe = (page: Page, ctx: ProbeCtx) => Promise<Finding[]>;
