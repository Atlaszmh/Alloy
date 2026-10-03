import type { DataRegistry } from '../data/registry.js';
import type { Haul } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { Rarity } from '../types/gear.js';
import { addHaul } from '../loot/materials.js';
import { runAutopilot, type AutopilotOptions } from './autopilot.js';

/** One dive as the autopilot reports it. */
export interface EconomyDive {
  dive: number;
  /** What the dive brought into the stockpile, after any loss: what it banked and kept, and an extract's bounty. */
  income: Haul;
  /** What the Anvil spent between this dive and the next: forging, refining, buying, Links, runes, honing, upgrades. */
  spent: Haul;
  /** What the stops spent from the stockpile during the dive (beyond what the dive had banked). */
  stops: Haul;
  /** What a death or an abandon lost: the floor's haul and the death share (null: nothing). */
  lost: Haul | null;
  /** Items forged on the Anvil visit after it, by rarity (every rarity, 0 where none). */
  forged: Record<Rarity, number>;
  /** The deepest depth reached. */
  depth: number;
  died: boolean;
}

/** One dive of the economy sim (the DPS Lab's Economy view): the stockpile changes by `income + salvaged - spent`. */
export interface EconomyRow extends EconomyDive {
  /** What the Anvil took in between this dive and the next: salvage yields, and what refining and fusing made. */
  salvaged: Haul;
  /** What the stops spent from the stockpile during the dive, and the Anvil between this dive and the next. */
  spent: Haul;
}

export interface EconomyReport {
  seed: number;
  /** Exactly the dives asked for, in order. */
  dives: EconomyRow[];
  /** The profile after the last dive's Anvil visit. */
  profile: DelveProfile;
}

/** The stockpile as a haul: materials, scrap, Mana Dust, Links and runes. */
function stockOf(p: DelveProfile): Haul {
  return { ...p.materials, scrap: p.scrap, dust: p.manaDust, links: p.links, runes: p.runes };
}

/** `h` with every count passed through `f`. */
function mapHaul(h: Haul, f: (n: number) => number): Haul {
  const counts = <T extends Record<string, number>>(r: T) =>
    Object.fromEntries(Object.entries(r).map(([k, n]) => [k, f(n)])) as T;
  const tiers = (r: Partial<Record<string, number[]>>) =>
    Object.fromEntries(Object.entries(r).map(([k, ns]) => [k, ns!.map(f)]));
  return {
    metals: counts(h.metals),
    flux: counts(h.flux),
    shards: tiers(h.shards),
    essences: counts(h.essences),
    scrap: f(h.scrap),
    dust: f(h.dust),
    links: f(h.links),
    runes: tiers(h.runes),
  };
}

/**
 * The autopilot over `dives` dives from a new save (`opts`: its pair), the
 * economy dive by dive: the DPS Lab's Economy view and the pacing rails.
 * It plays one dive at a time from the profile before it (as one run does), so
 * each dive's change to the stockpile is known: what the autopilot reports
 * (`income`, the Anvil's and the stops' spend) leaves the Anvil's gains, each
 * material exact. Plain data, so it crosses a worker's boundary.
 */
export function economySim(
  registry: DataRegistry,
  seed: number,
  dives: number,
  opts: Pick<AutopilotOptions, 'primary' | 'secondary'> = {},
): EconomyReport {
  let profile = runAutopilot(registry, { seed, dives: 0, ...opts }).profile;
  const out: EconomyRow[] = [];
  for (let n = 0; n < dives; n++) {
    const run = runAutopilot(registry, { seed, dives: 1, profile });
    const [row] = run.economy;
    // The stockpile's change, less the income, plus what the Anvil and the stops spent: the Anvil's gains.
    const delta = addHaul(stockOf(run.profile), mapHaul(stockOf(profile), (x) => -x));
    const salvaged = addHaul(
      addHaul(delta, mapHaul(row.income, (x) => -x)),
      addHaul(row.spent, row.stops),
    );
    out.push({ ...row, dive: n + 1, salvaged, spent: addHaul(row.spent, row.stops) });
    profile = run.profile;
  }
  return { seed, dives: out, profile };
}
