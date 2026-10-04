import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { firstEpicDive, legendaryFollowsEssence, pacingRun } from './fixtures/pacing.js';

/**
 * The crafting pacing targets must hold with margin, not on a knife-edge: the
 * first forges and the first legendary hang on scrap, so each holds with the
 * kill scrap (`drops.scrapByKind`) and the forge's price (`crafting.forgeScrap`)
 * 20% either way. (The balance pass checked every lever this way, and the depth
 * rails too, over eight seeds; this is its cheap proxy.) Eight dives: no essence
 * comes before drops.essenceMinDepth (20), which the bot reaches about dive 5.
 */

const SEEDS = [1, 2, 3, 4];
const DIVES = 8;
const LEVERS = { scrapByKind: 'drops', forgeScrap: 'crafting' } as const;

describe.each(Object.entries(LEVERS).flatMap(([lever, block]) => [0.8, 1.2].map((k) => ({ lever, block, k }))))(
  'the pacing targets with $block.$lever × $k',
  ({ lever, block, k }) => {
    const registry = createDefaultRegistry(); // its own data: scaled here only
    const table = (registry.getDelveBalance()[block] as unknown as Record<string, Record<string, number>>)[lever];
    for (const key of Object.keys(table)) table[key] *= k;
    const runs = SEEDS.map((seed) => pacingRun(registry, seed, DIVES));

    it('the kit forges before dive 1, and dive 1 pays for the magic item forged after it', () => {
      for (const [i, { first }] of runs.entries())
        expect(first, `seed ${SEEDS[i]}`).toEqual({ opened: true, kitAlone: false, withDive1: true, forged: true });
    });

    it('the first legendary follows the first essence within two visits, and three seeds in four forge an epic by dive 8', () => {
      for (const { economy } of runs)
        expect(legendaryFollowsEssence(economy), `seed ${economy.seed}`).toBe(true);
      // An epic waits on epic flux (deep bosses, quests): one seed in four may still be without.
      expect(runs.filter(({ economy }) => firstEpicDive(economy) > 0).length).toBeGreaterThanOrEqual(3);
    });
  },
);
