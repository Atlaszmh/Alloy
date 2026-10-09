import { describe, expect, it } from 'vitest';
import { catchUpSteps } from '../arena/useArenaCore';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('catchUpSteps (the bot-played arena on a slow renderer)', () => {
  it('splits the frame into equal steps of at most 0.1 s that add up to its game time', () => {
    for (const [frame, scale] of [
      [1 / 60, 2],
      [0.216, 2],
      [0.3, 1],
      [0.5, 4],
      [1.3, 2],
      [0.05, 0.25],
    ]) {
      const steps = catchUpSteps(frame, scale);
      expect(sum(steps)).toBeCloseTo(frame * scale, 12);
      for (const s of steps) {
        expect(s).toBeLessThanOrEqual(0.1 + 1e-12);
        expect(s).toBeCloseTo(steps[0], 12);
      }
    }
    expect(catchUpSteps(0.216, 2)).toHaveLength(5);
  });

  it('catches up at most 1.5 s of real time, so a stall cannot spiral', () => {
    expect(sum(catchUpSteps(5, 2))).toBeCloseTo(3, 12);
    expect(catchUpSteps(5, 2)).toHaveLength(30);
  });

  it('runs one empty step while the display is frozen (hit-stop: presses are still recorded)', () => {
    expect(catchUpSteps(0.2, 0)).toEqual([0]);
  });
});
