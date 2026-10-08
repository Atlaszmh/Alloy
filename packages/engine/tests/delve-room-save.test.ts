import { describe, it, expect } from 'vitest';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { registry } from './fixtures/arena.js';

// See the room objects spec: save v12, since a dive resumed from an older save would rebuild
// a different floor; older saves reset (no migrations).

const json = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('save v12', () => {
  it('a new save is version 14 and round-trips, mid-dive too', () => {
    const p = createDelveProfile(registry, 4, { primary: 'fire' });
    expect(p.version).toBe(14);
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
    const diving = startDive(registry, p, 1);
    expect(parseDelveProfile(registry, json(diving))).toEqual({ profile: diving });
  });

  it('a version 11 save resets, mid-dive or not', () => {
    const p = createDelveProfile(registry, 4, { primary: 'fire' });
    expect(parseDelveProfile(registry, json({ ...p, version: 11 }))).toEqual({ reset: true });
    const diving = startDive(registry, p, 1);
    expect(parseDelveProfile(registry, json({ ...diving, version: 11 }))).toEqual({
      reset: true,
    });
  });
});
