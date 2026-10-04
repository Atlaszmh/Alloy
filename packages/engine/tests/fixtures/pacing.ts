import type { DataRegistry } from '../../src/data/registry.js';
import { runAutopilot } from '../../src/delve/autopilot.js';
import { refine } from '../../src/delve/crafting.js';
import { economySim, type EconomyDive, type EconomyReport } from '../../src/delve/economy.js';
import { previewForge } from '../../src/loot/forge.js';
import { addHaul } from '../../src/loot/materials.js';
import { METAL_IDS, type Haul } from '../../src/types/crafting.js';
import type { DelveProfile } from '../../src/types/delve.js';
import type { Rarity } from '../../src/types/gear.js';
import { RARITY_ORDER, rarityIndex } from '../../src/types/gear.js';

/** The crafting spec's pacing targets, measured on the autopilot's economy (`economySim`). */

/** Whether the Anvil visit after a dive forged an item of `rarity` or rarer. */
export const forgedAtLeast = (d: EconomyDive, rarity: Rarity) =>
  RARITY_ORDER.some((r) => rarityIndex(r) >= rarityIndex(rarity) && d.forged[r] > 0);

const stockOf = (p: DelveProfile): Haul => ({
  ...p.materials,
  scrap: p.scrap,
  dust: p.manaDust,
  links: p.links,
  runes: p.runes,
});
const withStock = (p: DelveProfile, { scrap, dust, links, runes, ...materials }: Haul): DelveProfile => ({
  ...p,
  materials,
  scrap,
  manaDust: dust,
  links,
  runes,
});
/** `h` with every count times `k`. */
const scaled = (h: Haul, k: number): Haul =>
  JSON.parse(JSON.stringify(h), (_, v: unknown) => (typeof v === 'number' ? v * k : v));

/**
 * Whether `p`'s stockpile pays for a magic (or better) forge of its starting
 * sword on any bar it holds, refining its uncommon flux first.
 */
function affordsMagic(registry: DataRegistry, p: DelveProfile): boolean {
  let q = p;
  for (;;) {
    const r = refine(registry, q, { kind: 'flux', grade: 'uncommon' });
    if (!r.ok) break;
    q = r.profile;
  }
  const flux = (['magic', 'rare', 'epic'] as const).find((g) => q.materials.flux[g] > 0);
  return (
    flux !== undefined &&
    METAL_IDS.some(
      (metal) =>
        q.materials.metals[metal] > 0 &&
        previewForge(registry, q, { baseId: 'sword', metal, flux, element: q.pair.primary!, shards: [] })
          .refused === null,
    )
  );
}

/** One run's first forges: the targets "after dive 1, a magic item" and the kit's purpose (S8). */
export interface FirstForges {
  /** The opening Anvil visit, before dive 1, forged something from the kit. */
  opened: boolean;
  /** What the kit left could pay for a magic forge on its own (it shouldn't: dive 1 must). */
  kitAlone: boolean;
  /** What the kit left plus dive 1's income (less its stops' spend) pays for a magic forge. */
  withDive1: boolean;
  /** The Anvil visit after dive 1 forged a magic item or better. */
  forged: boolean;
}

/** A Fire run's economy over `dives` from a new save, and its first forges. */
export function pacingRun(
  registry: DataRegistry,
  seed: number,
  dives: number,
): { economy: EconomyReport; first: FirstForges } {
  const economy = economySim(registry, seed, dives);
  const open = runAutopilot(registry, { seed, dives: 0 }).profile;
  const [d1] = economy.dives;
  const { bestDepth } = runAutopilot(registry, { seed, dives: 1, profile: open }).profile;
  const stock = addHaul(addHaul(stockOf(open), d1.income), scaled(d1.stops, -1));
  return {
    economy,
    first: {
      opened: Object.values(open.stats.itemsFound).some((n) => n > 0),
      kitAlone: affordsMagic(registry, open),
      withDive1: affordsMagic(registry, withStock({ ...open, bestDepth }, stock)),
      forged: forgedAtLeast(d1, 'magic'),
    },
  };
}

/** The dive after which an epic (or a legendary) was first forged; 0 for none. */
export const firstEpicDive = (e: EconomyReport) =>
  e.dives.findIndex((d) => forgedAtLeast(d, 'epic')) + 1;

/**
 * Whether the first boss's essence forged a legendary on the visit after the dive that brought it
 * home (false: none came). It comes with an epic flux, which tells it from a vault's essence.
 */
export function essenceForgedAtOnce(e: EconomyReport): boolean {
  const first = e.dives.find(
    (d) => d.income.flux.epic > 0 && Object.values(d.income.essences).some((n) => n > 0),
  );
  return first !== undefined && first.forged.legendary > 0;
}
