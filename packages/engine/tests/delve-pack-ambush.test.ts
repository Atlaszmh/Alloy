import { describe, it, expect } from 'vitest';
import type { MonsterEntity } from '../src/types/arpg.js';
import { ON, packFloor, runWith } from './fixtures/pack.js';

// Ambushers (see the room objects spec's "Smarter packs"): a pack hidden asleep in foliage
// (B1 spawns it, `ambush`) wakes only when the hero comes within `ambushWake` or a pack in its
// room wakes; awake, it is hidden no more. The hero at (13, 36).

const asleep = (o: Partial<MonsterEntity>): Partial<MonsterEntity> => ({ aggro: false, ...o });

describe('an ambush pack', () => {
  it('sleeps on with the hero near and in sight, until it comes within ambushWake', () => {
    const w = packFloor([
      asleep({ x: 13, y: 31, ambush: true, packId: 2 }),
      asleep({ x: 14, y: 31, ambush: true, packId: 2 }),
    ]);
    // Five units off: a foe that isn't hiding would wake (aggroRadius 8).
    runWith(ON, w, 0.2);
    expect(w.monsters.map((m) => [m.aggro, m.ambush])).toEqual([
      [false, true],
      [false, true],
    ]);
    w.hero.y = 33.5;
    runWith(ON, w, 0.1);
    expect(w.monsters.map((m) => [m.aggro, m.ambush])).toEqual([
      [true, false],
      [true, false],
    ]);
  });

  it('wakes with any pack in its room, not with one in another', () => {
    const woken = (room: number) => {
      const w = packFloor([
        asleep({ x: 3, y: 3, ambush: true, packId: 2 }),
        asleep({ x: 13, y: 31, packId: 3, roomId: room }),
      ]);
      runWith(ON, w, 0.2);
      return [w.monsters[1].aggro, w.monsters[0].aggro, w.monsters[0].ambush];
    };
    expect(woken(0)).toEqual([true, true, false]);
    expect(woken(1)).toEqual([true, false, true]);
  });
});
