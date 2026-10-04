import { describe, it, expect, vi } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { createFloorWorld, emptyPending } from '../src/arpg/world.js';
import { beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Buff } from '../src/types/floor-map.js';

// See the floor maps spec: save v10 (no migration) and `beginFloor`'s pass-through.

vi.mock('../src/arpg/world.js', async (original) => {
  const world = await original<typeof import('../src/arpg/world.js')>();
  return { ...world, createFloorWorld: vi.fn(world.createFloorWorld) };
});

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const DEVOTION: Buff = { shrine: 'devotion', effect: { damage: 0.1 } };
const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);
/** `p`'s dive having used two interactables and taken a blessing. */
const blessed = (p: DelveProfile): DelveProfile => ({
  ...p,
  dive: { ...p.dive!, used: ['1:2', '1:5'], diveBuffs: [DEVOTION] },
});

describe('save v10', () => {
  it('a dive starts with nothing used and no blessings; a world has nothing pending', () => {
    const p = diving();
    expect(p.version).toBe(12);
    expect(p.dive).toMatchObject({ used: [], diveBuffs: [] });
    expect(emptyPending()).toMatchObject({ used: [], diveBuffs: [] });
  });

  it('round-trips what the dive used and its blessings', () => {
    const p = blessed(diving());
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
  });

  it('resets a version 10 save; refuses a dive without the new fields or with a bad blessing', () => {
    const p = blessed(diving());
    expect(parseDelveProfile(registry, json({ ...p, version: 10 }))).toEqual({ reset: true });
    const { used: _u, ...noUsed } = p.dive!;
    expect(parseDelveProfile(registry, json({ ...p, dive: noUsed }))).toBeNull();
    const bad = { ...p.dive!, diveBuffs: [{ shrine: 'devotion', effect: { haste: 1 } }] };
    expect(parseDelveProfile(registry, json({ ...p, dive: bad }))).toBeNull();
  });
});

describe('beginFloor', () => {
  it("asks for a generated floor with the dive's used interactables and blessings", () => {
    const p = blessed(diving());
    const w = beginFloor(registry, p);
    expect(createFloorWorld).toHaveBeenLastCalledWith(
      registry,
      expect.objectContaining({ layout: 'generated', used: ['1:2', '1:5'], diveBuffs: [DEVOTION] }),
    );
    expect(w.hero.diveBuffs).toEqual([DEVOTION]);
  });
});
