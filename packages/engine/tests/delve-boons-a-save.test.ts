import { describe, it, expect } from 'vitest';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { startDive } from '../src/delve/dive.js';
import type { Buff } from '../src/types/boon.js';
import type { DelveProfile } from '../src/types/delve.js';
import { registry } from './fixtures/arena.js';

// See the boons spec, "4. The stop" (Save): version 14 since the constructs; any other version resets.

const KEEN: Buff = { boon: 'keen_edge', tier: 2, effect: { damage: 0.15 } };
const ECHO: Buff = {
  boon: 'echo',
  tier: 3,
  effect: { knobs: { echo: 0.4, quick: { cooldown: 0.9 } } },
};

describe('save v13', () => {
  it('a new save is version 14, and a dive with boons and a boons stop round-trips', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(p0.version).toBe(14);
    const diving = startDive(registry, p0, 1);
    const p: DelveProfile = {
      ...diving,
      dive: {
        ...diving.dive!,
        phase: 'choosing',
        diveBuffs: [KEEN, ECHO],
        stop: { kind: 'boons', offers: [{ id: 'keen_edge', tier: 3 }], taken: false },
      },
    };
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))).toEqual({ profile: p });
  });

  it('a version 12 save resets', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(parseDelveProfile(registry, { ...JSON.parse(JSON.stringify(p)), version: 12 })).toEqual({
      reset: true,
    });
  });
});
