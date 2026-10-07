import { describe, it, expect } from 'vitest';
import { planFloor } from '../src/arpg/layout/generate.js';
import { applyShrine } from '../src/arpg/interact.js';
import { tutorialFloorMap } from '../src/arpg/tutorial-floor.js';
import { registry } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// See the boons spec, "1. The boon row": the shrines are boon rows, drawn as before, and a
// blessing is a `Buff` of its row at tier 1.

const SEEDS = Array.from({ length: 20 }, (_, i) => 1 + i * 7919);
/** Every floor's sanctum shrines by depth, one entry a seed ('-': none), pinned before the change. */
const BEFORE: Record<number, string> = {
  12: '- - - - - - - - - - - - - - - - clarity - - -',
  20: '- - - renewal - - - - - - clarity - - vigor - - - - - -',
  28: '- - - clarity - - - - - - renewal - - - - - renewal - - -',
  36: '- - - devotion - - - - vigor - renewal - - - - - vigor - - -',
  44: '- - - devotion - - - - vigor - renewal - - - - - vigor - - -',
  60: '- - - vigor - - - - - - fortune - fortune fortune - - - - - -',
};

describe('the shrines as boon rows', () => {
  it('every generated sanctum holds the shrine it held before', () => {
    for (const [depth, want] of Object.entries(BEFORE)) {
      const biome = registry.getBiomeForDepth(Number(depth));
      const got = SEEDS.map(
        (seed) =>
          planFloor(registry, seed, Number(depth), biome, null)
            .map.rooms.filter((r) => r.kind === 'sanctum')
            .map((r) => r.interactable!.shrine)
            .join('+') || '-',
      ).join(' ');
      expect(got, `depth ${depth}`).toBe(want);
    }
  });

  it("the tutorial floor's shrine is still Vigor", () => {
    const shrines = registry
      .getTutorialData()
      .floors.flatMap((f) => tutorialFloorMap(registry, f, f.depth).rooms)
      .flatMap((r) => (r.interactable?.kind === 'shrine' ? [r.interactable.shrine] : []));
    expect(shrines.length).toBeGreaterThan(0);
    expect(new Set(shrines)).toEqual(new Set(['vigor']));
  });

  it("a blessing is its row's tier 1, on the floor or the dive by its duration", () => {
    const w = floorWorld(twoRooms('sanctum', { kind: 'shrine', shrine: 'clarity' }));
    applyShrine(registry, w, registry.getBoon('vigor')!);
    applyShrine(registry, w, registry.getBoon('devotion')!);
    expect(w.hero.floorBuffs).toEqual([{ boon: 'vigor', tier: 1, effect: { damage: 0.2 } }]);
    expect(w.hero.diveBuffs).toEqual([{ boon: 'devotion', tier: 1, effect: { damage: 0.1 } }]);
    expect(w.pending.diveBuffs).toEqual(w.hero.diveBuffs);
  });
});
