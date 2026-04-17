import type { Probe, ProbeCtx, Finding } from './types';

const PROBE = 'dead-space';
const DEFAULT_MIN_RATIO = 0.80;

export interface DeadSpaceOptions {
  /** Minimum acceptable contentHeight / frameHeight ratio. Default 0.80. */
  minRatio?: number;
}

export const deadSpace = (options: DeadSpaceOptions = {}): Probe =>
  async (page, ctx: ProbeCtx): Promise<Finding[]> => {
    const minRatio = options.minRatio ?? DEFAULT_MIN_RATIO;
    const data = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('.app-frame');
      if (!frame) return null;
      const fr = frame.getBoundingClientRect();
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-screen-section]'));
      const totalHeight = sections.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
      return {
        frameHeight: fr.height,
        sectionCount: sections.length,
        totalHeight,
      };
    });

    if (!data) return [];
    if (data.sectionCount === 0) {
      return [{
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'warn',
        detail: 'no [data-screen-section] markers present — add them for dead-space measurement',
      }];
    }

    const ratio = data.frameHeight > 0 ? data.totalHeight / data.frameHeight : 0;
    if (ratio < minRatio) {
      return [{
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `content fills ${(ratio * 100).toFixed(1)}% of frame (${data.totalHeight.toFixed(0)}/${data.frameHeight.toFixed(0)}), below ${(minRatio * 100).toFixed(0)}% threshold`,
        measured: ratio,
        expected: minRatio,
      }];
    }
    return [];
  };

export const deadSpaceDefault: Probe = deadSpace();
