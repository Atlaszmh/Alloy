import { describe, it, expect } from 'vitest';
import { statKeyLabel } from '../stat-key-labels.js';

describe('statKeyLabel', () => {
  it('maps known compound stat keys to friendly labels', () => {
    expect(statKeyLabel('compound.ignite.absorbChance')).toBe('Incoming fire absorption chance');
    expect(statKeyLabel('compound.ignite.chance')).toBe('Trigger chance');
    expect(statKeyLabel('compound.bastion.active')).toBe('Capstone active');
  });

  it('infers "Trigger chance" for unmapped compound.<id>.chance keys', () => {
    expect(statKeyLabel('compound.never_seen_compound.chance')).toBe('Trigger chance');
  });

  it('infers "Capstone active" for unmapped compound.<id>.active keys', () => {
    expect(statKeyLabel('compound.never_seen_compound.active')).toBe('Capstone active');
  });

  it('falls back to raw key for unrecognized keys', () => {
    expect(statKeyLabel('damage')).toBe('damage');
    expect(statKeyLabel('compound.unknown.weirdField')).toBe('compound.unknown.weirdField');
  });
});
