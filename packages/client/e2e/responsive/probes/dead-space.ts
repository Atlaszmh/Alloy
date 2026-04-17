import type { Probe, ProbeCtx, Finding } from './types';

export interface DeadSpaceOptions {
  /** Minimum acceptable contentHeight / frameHeight ratio. Default 0.80. */
  minRatio?: number;
}

export const deadSpace = (options: DeadSpaceOptions = {}): Probe =>
  async (_page, _ctx: ProbeCtx): Promise<Finding[]> => {
    void options;
    return [];
  };

export const deadSpaceDefault: Probe = deadSpace();
