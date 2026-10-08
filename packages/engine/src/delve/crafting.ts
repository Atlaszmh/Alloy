import type { DataRegistry } from '../data/registry.js';
import {
  forgeInputs,
  forgeItem,
  forgedMoveset,
  honeCost,
  honeLine,
  imprintCost,
  imprintLine,
  imprintRefusal,
  previewForge,
} from '../loot/forge.js';
import { implicitValue, scrapLevelFactor } from '../loot/item-generator.js';
import { materialCount, refineCost, refinedRef, withMaterial } from '../loot/materials.js';
import { ceilingOf, defaultForm, movesetOf, plainConstruct, weaponClass } from '../loot/moveset.js';
import {
  FLUX_GRADES,
  type FluxGrade,
  type ForgeRequest,
  type MaterialRef,
  type ShardRef,
} from '../types/crafting.js';
import type { AbilitySlot, Move } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, HeroStatKey } from '../types/gear.js';
import { isDiveActive } from './dive.js';
import { compareItem } from './hero-stats.js';
import { applyQuestEvents } from './quests.js';
import { applyTutorialEvents } from './tutorial.js';
import {
  findItem,
  forgeRng,
  mintMoveset,
  recordFinds,
  mintUid,
  referenceDepth,
  replaceItem,
  type ProfileActionResult,
} from './profile.js';

/**
 * The Anvil's crafting ops on the profile (see the crafting spec), each refused
 * mid-dive (the dive lock) with a reason, as the other profile ops are. Each
 * op that rolls draws on `forge:${forgeCount}` and moves the count on.
 */

const FORGE_LOCKED = 'Forge at the Anvil, between dives';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** Forge `req` into the bag, paying its price and consuming its materials (`ProfileActionResult.item`). */
export function forge(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ProfileActionResult {
  const preview = previewForge(registry, profile, req);
  if (preview.refused) return refuse(profile, preview.refused.reason);
  const rolled = forgeItem(registry, profile, req, forgeRng(profile));
  const materials = forgeInputs(req).reduce(
    (m, ref) => withMaterial(m, ref, -1),
    profile.materials,
  );
  // The item takes `g<nextUid>`; its constructs their `c<n>` uids (the constructs spec §3.1).
  const [item, minted] = rolled.moveset
    ? (([moveset, p]) => [{ ...rolled, moveset }, p] as const)(mintMoveset(profile, rolled.moveset))
    : ([rolled, profile] as const);
  const paid: DelveProfile = {
    ...minted,
    materials,
    scrap: profile.scrap - preview.price.scrap,
    manaDust: profile.manaDust - preview.price.dust,
    bag: [...profile.bag, item],
    nextUid: profile.nextUid + 1,
    forgeCount: profile.forgeCount + 1,
  };
  const forged = recordFinds(paid, [item]).profile;
  const events = [{ type: 'forge', rarity: item.rarity, legendary: !!item.legendary }] as const;
  const next = applyTutorialEvents(registry, applyQuestEvents(registry, forged, events), events);
  return { ok: true, item, profile: next };
}

/** A forge's Power change against what is worn, at the bottom and the top of its bands (`forgePowerRange`). */
export interface ForgePowerRange {
  low: number;
  high: number;
  /** The random lines left out of both ends. */
  random: number;
}

/**
 * The Power a forge would change by against what is worn (the pad-first spec, 4): `low` the
 * item with every chosen line, implicit and legendary power at the bottom of its band (the
 * attunement floor applied), `high` at the top; a weapon valued as a home for your moveset
 * (`compareItem`'s default), as the bag values a tile. Random lines are left out of both ends:
 * `random` counts them. The purse and the materials don't matter (a refused request has a range).
 * Pure: it draws nothing.
 */
export function forgePowerRange(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ForgePowerRange {
  const p = previewForge(registry, profile, req);
  const base = registry.getGearBase(p.baseId);
  /** A band's roll at its bottom once the floor lifts it (0), or at its top (1). */
  const rollAt = ([b0, b1]: readonly [number, number], end: 0 | 1) =>
    end ? b1 : b0 + (b1 - b0) * p.floor;
  const at = (end: 0 | 1): GearItem => ({
    uid: 'forge-preview',
    slot: p.slot,
    baseId: p.baseId,
    rarity: p.rarity,
    mana: p.element,
    ilvl: p.ilvl,
    name: '',
    implicits: base.implicits.map((t) => ({
      stat: t.stat,
      value: implicitValue(registry, t, p.ilvl, p.rarity, end),
      roll: end,
    })),
    affixes: p.lines.flatMap((l) =>
      l.shard && l.range
        ? [{ stat: l.shard.stat, value: l.range[end], roll: rollAt(l.band, end), band: [l.band[0], l.band[1]] as [number, number] }]
        : [],
    ),
    upgrade: 0,
    reforges: 0,
    hones: 0,
    locked: false,
    ...(p.legendary && {
      legendary: { id: p.legendary.id, value: p.legendary.range[end], roll: rollAt(p.legendary.band, end) },
    }),
    ...(p.slot === 'weapon' && {
      moveset: forgedMoveset(registry, { baseId: p.baseId, rarity: p.rarity, mana: p.element }),
    }),
  });
  const depth = referenceDepth(profile);
  const power = (item: GearItem) =>
    compareItem(profile.equipped, item, registry, depth, profile.pair).powerPct;
  return { low: power(at(0)), high: power(at(1)), random: p.lines.filter((l) => !l.shard).length };
}

/** Hone affix line `line` of item `uid`, for scrap. */
export function hone(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  line: number,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  const found = findItem(profile, uid);
  if (!found) return refuse(profile, 'Item not found');
  if (!found.item.affixes[line]) return refuse(profile, 'No such affix');
  const cost = honeCost(registry, found.item);
  if (profile.scrap < cost) return refuse(profile, 'Not enough scrap');
  const item = honeLine(registry, profile, found.item, line, forgeRng(profile));
  const honed: DelveProfile = {
    ...replaceItem(profile, item),
    scrap: profile.scrap - cost,
    forgeCount: profile.forgeCount + 1,
  };
  return { ok: true, item, profile: applyTutorialEvents(registry, honed, [{ type: 'hone' }]) };
}

/** Imprint `shard` on affix line `line` of item `uid`, for the shard and scrap. */
export function imprint(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  line: number,
  shard: ShardRef,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  const found = findItem(profile, uid);
  if (!found) return refuse(profile, 'Item not found');
  const why = imprintRefusal(registry, found.item, line, shard);
  if (why) return refuse(profile, why);
  const ref: MaterialRef = { kind: 'shard', ...shard };
  if (materialCount(profile.materials, ref) < 1) return refuse(profile, 'Missing the shard');
  const cost = imprintCost(registry, found.item);
  if (profile.scrap < cost) return refuse(profile, 'Not enough scrap');
  const item = imprintLine(registry, profile, found.item, line, shard, forgeRng(profile));
  return {
    ok: true,
    item,
    profile: {
      ...replaceItem(profile, item),
      materials: withMaterial(profile.materials, ref, -1),
      scrap: profile.scrap - cost,
      forgeCount: profile.forgeCount + 1,
    },
  };
}

/** Refine `refine.<kind>.count` of a bar, a flux or a shard into one of the next grade, for scrap. */
export function refine(
  registry: DataRegistry,
  profile: DelveProfile,
  what: MaterialRef,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  const next = refinedRef(registry, what);
  if (!next) return refuse(profile, "Doesn't refine any higher");
  const cost = refineCost(registry, what)!;
  if (materialCount(profile.materials, what) < cost.count)
    return refuse(profile, `Needs ${cost.count} to refine`);
  if (profile.scrap < cost.scrap) return refuse(profile, 'Not enough scrap');
  const refined: DelveProfile = {
    ...profile,
    materials: withMaterial(withMaterial(profile.materials, what, -cost.count), next, 1),
    scrap: profile.scrap - cost.scrap,
  };
  const events = [{ type: 'refine' }] as const;
  const done = applyTutorialEvents(registry, applyQuestEvents(registry, refined, events), events);
  return { ok: true, profile: done };
}

/** What Open a skill costs on `item` (the constructs spec §3.2): `movesets.openSkill[rarity]`, its scrap × `scrapLevelFactor(ilvl)`. */
export function openSkillPrice(
  registry: DataRegistry,
  item: GearItem,
): { flux: Partial<Record<FluxGrade, number>>; links: number; scrap: number } {
  const price = registry.getDelveBalance().movesets.openSkill[item.rarity];
  return {
    flux: { ...price.flux },
    links: price.links,
    scrap: Math.round(price.scrap * scrapLevelFactor(registry, item.ilvl)),
  };
}

/**
 * Open a skill on weapon `uid`, worn or in the bag (the constructs spec §3.2,
 * Awaken generalised): a skill at 0 slots whose ceiling is at least 1 gains
 * its first slot, bought, holding a plain construct in the pair's primary (the
 * weapon's mana before the choice) at the skill's default payment, for
 * `openSkillPrice` (flux by grade, Links and scrap). Refused mid-dive, on an
 * unknown item, on anything but a weapon, on a skill with slots already, at a
 * ceiling of 0, and unpaid. Pure: the Temper bench reads its refusal from a dry
 * run. Emits the tutorial's `openSkill` event.
 */
export function openSkill(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  skill: AbilitySlot,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  const found = findItem(profile, uid);
  if (!found) return refuse(profile, 'Item not found');
  const { item } = found;
  if (item.slot !== 'weapon') return refuse(profile, 'Only a weapon opens a skill');
  const moveset = movesetOf(registry, item);
  if (moveset.slots[skill]) return refuse(profile, 'This skill is open already');
  if (ceilingOf(registry, item, skill) < 1)
    return refuse(profile, `A ${item.rarity} weapon can't open its ${skill}`);
  const price = openSkillPrice(registry, item);
  for (const grade of FLUX_GRADES) {
    const need = price.flux[grade] ?? 0;
    if (need > 0 && materialCount(profile.materials, { kind: 'flux', grade }) < need)
      return refuse(profile, `Not enough ${grade} flux`);
  }
  if (profile.links < price.links) return refuse(profile, 'Not enough Links');
  if (profile.scrap < price.scrap) return refuse(profile, 'Not enough scrap');
  const element = profile.pair.primary ?? item.mana;
  const [cuid, minted] = mintUid(profile);
  const move = { ...plainConstruct(registry, item, skill, 0, element), uid: cuid } as Move;
  const { payment } = defaultForm(registry, skill, weaponClass(registry, item.baseId));
  const opened: GearItem = {
    ...item,
    moveset: {
      chains: { ...moveset.chains, [skill]: { moves: [move], payment } },
      slots: { ...moveset.slots, [skill]: 1 },
      bought: { ...moveset.bought, [skill]: 1 },
    },
  };
  let materials = profile.materials;
  for (const grade of FLUX_GRADES) {
    const need = price.flux[grade] ?? 0;
    if (need > 0) materials = withMaterial(materials, { kind: 'flux', grade }, -need);
  }
  const paid: DelveProfile = {
    ...replaceItem(minted, opened),
    materials,
    links: profile.links - price.links,
    scrap: profile.scrap - price.scrap,
  };
  return {
    ok: true,
    item: opened,
    profile: applyTutorialEvents(registry, paid, [{ type: 'openSkill', skill }]),
  };
}

/** Buy a tier I shard of `stat` at the shard bench (`crafting.shardBench`). */
export function buyShard(
  registry: DataRegistry,
  profile: DelveProfile,
  stat: HeroStatKey,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, FORGE_LOCKED);
  if (!registry.getGearAffix(stat)) return refuse(profile, 'No such affix');
  const price = registry.getDelveBalance().crafting.shardBench;
  if (profile.scrap < price.scrap) return refuse(profile, 'Not enough scrap');
  if (profile.manaDust < price.dust) return refuse(profile, 'Not enough Mana Dust');
  return {
    ok: true,
    profile: {
      ...profile,
      materials: withMaterial(profile.materials, { kind: 'shard', stat, tier: 1 }, 1),
      scrap: profile.scrap - price.scrap,
      manaDust: profile.manaDust - price.dust,
    },
  };
}
