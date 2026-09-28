import { describe, it, expect } from 'vitest';
import { reactionLabel } from '../reactions';

describe('reaction labels', () => {
  it('come from the data, so a new reaction never floats "undefined"', () => {
    expect(reactionLabel('melt')).toBe('MELT!');
    expect(reactionLabel('lightning_rod')).toBe('LIGHTNING ROD!');
  });
});
