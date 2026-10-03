import type { DataRegistry } from '../data/registry.js';
import type { DelveProfile } from '../types/delve.js';
import type { GearItem, GearSlot, HeroStatKey, Rarity } from '../types/gear.js';
import { GEAR_SLOTS } from '../types/gear.js';
import { RARITY_ORDER } from '../types/gem.js';
import type { ManaType } from '../types/mana.js';
import {
  FLUX_GRADES,
  METAL_IDS,
  type ForgeRequest,
  type Haul,
  type ShardRef,
} from '../types/crafting.js';
import { upgradeCost } from '../loot/smithing.js';
import { honeCost, previewForge } from '../loot/forge.js';
import { addHaul, emptyHaul } from '../loot/materials.js';
import { botInput } from '../arpg/bot.js';
import { stepWorld } from '../arpg/step.js';
import {
  bankWorld,
  beginFloor,
  chooseDoor,
  closeDive,
  completeFloor,
  extractDive,
  failFloor,
  startDepthOptions,
  startDive,
} from './dive.js';
import { compareItem, type WeaponValue } from './hero-stats.js';
import { heroChains, movesetOf } from '../loot/moveset.js';
import { bindSecondary, resolveOvertake } from './pair.js';
import {
  createDelveProfile,
  equipBest,
  profilePower,
  referenceDepth,
  salvageCandidates,
  salvageItems,
  upgradeGear,
} from './profile.js';
import { buyShard, forge, hone, refine } from './crafting.js';
import { addSlot, movesOf, setChain, transferMoveset, withMove } from './moveset.js';
import { fuseRunes, openSocket } from './runes.js';
import { pouchCount, runeFits, socketCap, socketsOf } from '../loot/runes.js';
import { takeStop, type StopAction } from './stops.js';
import { claimQuest, questStates } from './quests.js';
import { MAX_CHAIN, type Blow, type ChainSkill, type Move } from '../types/ability.js';
import { RUNE_TIERS, type RuneRef, type RuneTarget, type RuneTier } from '../types/rune.js';
import type { EconomyDive } from './economy.js';

/**
 * Plays whole dives with the arena bot, like a sensible player: fights every
 * floor (its gear locked, loot to the bag, materials to the haul), picks
 * doors, extracts when spent, and between dives (and once before the first)
 * visits the Anvil: forges its gear from materials, moves its moveset to a
 * better weapon, salvages what it doesn't wear, adds slots and sockets runes,
 * hones and upgrades (claiming its completed quests and contracts first, never
 * rerolling). Used by the pacing test, `economySim` and for balance sweeps.
 */

export interface AutopilotOptions {
  seed: number;
  dives: number;
  /** Safety cap on depth per dive. */
  maxDepth?: number;
  /** A floor that runs longer than this counts as a death. */
  maxFloorSeconds?: number;
  /** Continue from an existing profile instead of a fresh one (no opening Anvil visit). */
  profile?: DelveProfile;
  /** A fresh profile's starting mana (default fire). */
  primary?: ManaType;
  /** Bind this second element before the first dive (the Primary built from both), forcing the pair. */
  secondary?: ManaType;
}

export interface AutopilotDiveReport {
  dive: number;
  startDepth: number;
  endDepth: number;
  result: 'dead' | 'extracted' | 'capped';
  power: number;
  kills: number;
  floorSeconds: number;
  legendariesOwned: number;
  reactionsSeen: number;
  scrap: number;
}

const DOOR_PREFERENCE = ['winding', 'gilded', 'swarm', 'champions', 'cursed', 'plunge', 'shrine'];
const STEP = 1 / 30;

function playFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  maxSeconds: number,
): { profile: DelveProfile; seconds: number; died: boolean } {
  let p = profile;
  const world = beginFloor(registry, p);
  while (!world.heroDead && world.t < maxSeconds) {
    stepWorld(registry, world, botInput(registry, world), STEP);
    if (world.pending.items.length > 0) p = bankWorld(registry, p, world).profile;
    if (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 3)) break;
  }
  if (world.heroDead || !world.cleared) {
    return { profile: failFloor(registry, p, world).profile, seconds: world.t, died: true };
  }
  return { profile: completeFloor(registry, p, world).profile, seconds: world.t, died: false };
}

/**
 * The next door, or null to extract: when spent (low on life, no potions, no
 * shrine), or to bring home an essence or epic flux it has banked.
 */
function pickDoor(profile: DelveProfile): string | null {
  const dive = profile.dive!;
  if (dive.banked.flux.epic > 0 || Object.values(dive.banked.essences).some((n) => n > 0)) return null;
  if (dive.heroHpFrac < 0.35 && dive.potions === 0 && !dive.doorChoices.includes('shrine')) return null;
  if (dive.heroHpFrac < 0.5 && dive.doorChoices.includes('shrine')) return 'shrine';
  for (const id of DOOR_PREFERENCE) if (dive.doorChoices.includes(id)) return id;
  return dive.doorChoices[0];
}

/**
 * Once it has fought (its deepest depth past 0: after its first dive), bind a
 * second element: the first of the biomes' elements, in depth order, other
 * than its primary (depth 1's biome is always fought; a hero whose primary
 * that is takes the next biome's).
 */
function bindPair(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const { primary, secondary } = profile.pair;
  if (!primary || secondary || profile.bestDepth === 0) return profile;
  const mana = registry
    .getDelveData()
    .biomes.map((b) => b.mana)
    .find((m) => m !== primary);
  return mana ? bindSecondary(registry, profile, mana).profile : profile;
}

/**
 * Build every move of the weapon's Primary chain from both elements of a
 * bound pair, so it keeps finding their reaction, when it can pay for the edit.
 */
function fusePrimary(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const { primary, secondary } = p.pair;
  const chain = heroChains(registry, p.equipped, p.pair).primary;
  if (!primary || !secondary || !chain) return p;
  const moves = chain.moves.map((m) => ({ ...m, elements: [primary, secondary] }));
  const res = setChain(registry, p, 'primary', { ...chain, moves });
  return res.ok ? res.profile : p;
}

/**
 * Claim every completed quest and contract, in the journal's order, until none
 * is left (a claimed main quest can unlock one already done: an early bind).
 */
function claimAll(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (;;) {
    const done = questStates(registry, p).find((q) => q.status === 'complete');
    const res = done && claimQuest(registry, p, done.id);
    if (!res?.ok) return p;
    p = res.profile;
  }
}

/** Between dives: a visit to the Anvil (`anvilVisit`). */
export function betweenDives(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  return anvilVisit(registry, profile).profile;
}

/** The skills the bot adds slots to, in order: each as far as its Links and scrap go. */
const SLOT_ORDER: ChainSkill[] = ['primary', 'basic', 'ultimate', 'defensive'];
/**
 * The slots a chain gets before the Links go to sockets for the pouch's runes; the 4th and 5th
 * after (the runes balance pass: at 5, sockets got the leftovers and 20-43 runes sat in the pouch).
 */
const SOCKETS_AFTER = 3;

/** The bag item `pick` allows that raises Power the most (a weapon valued `value`), or null. */
function bestGain(
  registry: DataRegistry,
  p: DelveProfile,
  value: WeaponValue,
  pick: (item: GearItem) => boolean = () => true,
): string | null {
  const depth = referenceDepth(p);
  let best: { uid: string; pct: number } | null = null;
  for (const item of p.bag) {
    if (!pick(item)) continue;
    const pct = compareItem(p.equipped, item, registry, depth, p.pair, value).powerPct;
    if (pct > (best?.pct ?? 0)) best = { uid: item.uid, pct };
  }
  return best?.uid ?? null;
}

/** The equipped item whose next upgrade costs least (on a tie, the first in `GEAR_SLOTS`). */
function cheapestUpgrade(
  registry: DataRegistry,
  p: DelveProfile,
): { uid: string; cost: number } | null {
  let cheapest: { uid: string; cost: number } | null = null;
  for (const slot of GEAR_SLOTS) {
    const item = p.equipped[slot];
    const cost = item ? upgradeCost(registry, item) : null;
    if (item && cost !== null && (!cheapest || cost < cheapest.cost))
      cheapest = { uid: item.uid, cost };
  }
  return cheapest;
}

/**
 * Move the moveset onto the bag weapon that makes the best home (valued with
 * it moved: `compareItem`'s default), when that raises Power and it can pay.
 */
function transferBest(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const uid = bestGain(registry, p, 'home', (item) => item.slot === 'weapon');
  if (!uid) return p;
  const res = transferMoveset(registry, p, uid);
  return res.ok ? res.profile : p;
}

/**
 * Spend Links on slots in `SLOT_ORDER`, up to `upTo` a chain: each skill's next
 * slot while it can pay, then the next skill's (a slot it can't afford passes
 * to the next).
 */
function spendLinks(
  registry: DataRegistry,
  profile: DelveProfile,
  upTo = MAX_CHAIN,
): DelveProfile {
  let p = profile;
  const slots = (skill: ChainSkill) =>
    p.equipped.weapon ? (movesetOf(registry, p.equipped.weapon).slots[skill] ?? 0) : 0;
  for (const skill of SLOT_ORDER)
    while (slots(skill) < upTo) {
      const res = addSlot(registry, p, skill);
      if (!res.ok) break;
      p = res.profile;
    }
  return p;
}

/** Every move of the equipped weapon's chains, in `SLOT_ORDER`, each chain from its first. */
function weaponMoves(
  registry: DataRegistry,
  p: DelveProfile,
): { skill: ChainSkill; index: number; move: Move | Blow }[] {
  const weapon = p.equipped.weapon;
  if (!weapon) return [];
  const { chains } = movesetOf(registry, weapon);
  return SLOT_ORDER.flatMap((skill) =>
    movesOf(chains[skill]).map((move, index) => ({ skill, index, move })),
  );
}

/** What a move's runes sit on: its form, or the equipped weapon's blow. */
function targetOf(p: DelveProfile, move: Move | Blow): RuneTarget {
  return 'form' in move
    ? { form: move.form }
    : { weapon: p.equipped.weapon?.baseId ?? null, kind: move.kind };
}

/** The pouch runes the bot weighs: each id's highest tier held, in `runes.json` order. */
function pouchBest(registry: DataRegistry, p: DelveProfile): RuneRef[] {
  return registry.getRunes().flatMap(({ id }) => {
    for (let tier = RUNE_TIERS; tier >= 1; tier--) {
      const ref = { id, tier: tier as RuneTier };
      if (pouchCount(p.runes, ref) > 0) return [ref];
    }
    return [];
  });
}

/**
 * Whether `rune` may go in socket `socket` of `move`: it fits the move, and no
 * rune of its id is on the move (but a lower tier of it in that socket).
 */
function takes(
  registry: DataRegistry,
  p: DelveProfile,
  move: Move | Blow,
  socket: number,
  rune: RuneRef,
): boolean {
  return (
    runeFits(registry.getRune(rune.id), targetOf(p, move)) &&
    socketsOf(move).every((r, k) => r?.id !== rune.id || (k === socket && r.tier < rune.tier))
  );
}

/** Fuse every triple in the pouch, lowest tier first, so a fused rune can make a triple above it. */
function fusePouch(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const need = registry.getDelveBalance().runes.fuseCount;
  let p = profile;
  for (let tier = 1; tier < RUNE_TIERS; tier++)
    for (const { id } of registry.getRunes()) {
      const ref = { id, tier: tier as RuneTier };
      while (pouchCount(p.runes, ref) >= need) {
        const res = fuseRunes(registry, p, ref);
        if (!res.ok) return p; // short of scrap: every later fuse costs as much or more
        p = res.profile;
      }
    }
  return p;
}

/**
 * Socket `socket` of move `index` of `skill` with the pouch rune that raises Power most
 * (`takes`), over `than` (by default `p`'s); a filled one is pulled by the pull rule. Null
 * when no rune gains.
 */
function bestRune(
  registry: DataRegistry,
  p: DelveProfile,
  skill: ChainSkill,
  index: number,
  socket: number,
  than = profilePower(registry, p),
): DelveProfile | null {
  let best: { profile: DelveProfile; power: number } | null = null;
  const chain = movesetOf(registry, p.equipped.weapon!).chains[skill]!;
  const now = movesOf(chain)[index];
  for (const rune of pouchBest(registry, p)) {
    if (!takes(registry, p, now, socket, rune)) continue;
    const runes = socketsOf(now).map((r, k) => (k === socket ? rune : r));
    const res = setChain(registry, p, skill, withMove(chain, index, { ...now, runes }));
    const power = res.ok ? profilePower(registry, res.profile) : 0;
    if (res.ok && power > (best?.power ?? than)) best = { profile: res.profile, power };
  }
  return best?.profile ?? null;
}

/**
 * Open sockets with the Links the slots left, each only for a pouch rune that
 * goes in at once and raises Power (an empty socket is Links for nothing):
 * each time on the move whose next socket is cheapest (the fewest open; on a
 * tie, the first in `SLOT_ORDER`) that such a rune fits, below the weapon's
 * cap, while it can pay.
 */
function openSockets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const cap = socketCap(registry, profile.equipped.weapon?.rarity ?? null);
  let p = profile;
  for (;;) {
    const power = profilePower(registry, p);
    // A stable sort: on a tie, `SLOT_ORDER`, each chain from its first move.
    const moves = weaponMoves(registry, p)
      .map((m) => ({ ...m, open: socketsOf(m.move).length }))
      .filter((m) => m.open < cap)
      .sort((a, b) => a.open - b.open);
    let next: DelveProfile | null = null;
    for (const { skill, index, open } of moves) {
      const res = openSocket(registry, p, skill, index);
      if (!res.ok) break; // can't pay: every later socket costs as much or more
      next = bestRune(registry, res.profile, skill, index, open, power);
      if (next) break;
    }
    if (!next) return p;
    p = next;
  }
}

/**
 * Fill the sockets in `SLOT_ORDER`, each chain from its first move: each takes
 * the pouch rune that raises Power most (`takes`); a filled one changes only
 * for a rune that gains Power, its own pulled by the pull rule.
 */
function socketBest(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (const { skill, index, move } of weaponMoves(registry, profile))
    for (let socket = 0; socket < socketsOf(move).length; socket++)
      p = bestRune(registry, p, skill, index, socket) ?? p;
  return p;
}

/** A stop's rune: the pouch rune into an empty socket that raises Power most, or null when none gains. */
function runeStop(
  registry: DataRegistry,
  profile: DelveProfile,
  take: (action: StopAction) => DelveProfile | null,
): DelveProfile | null {
  let best: { profile: DelveProfile; power: number } | null = null;
  const now = profilePower(registry, profile);
  for (const { skill, index, move } of weaponMoves(registry, profile))
    for (const [socket, held] of socketsOf(move).entries()) {
      if (held) continue;
      for (const rune of pouchBest(registry, profile)) {
        if (!takes(registry, profile, move, socket, rune)) continue;
        const taken = take({ kind: 'rune', skill, index, socket, rune });
        const power = taken ? profilePower(registry, taken) : 0;
        if (taken && power > (best?.power ?? now)) best = { profile: taken, power };
      }
    }
  return best?.profile ?? null;
}

/**
 * At a stop between depths, by preference: equip the bag item that beats its
 * gear the most as it is; else socket the pouch rune that raises Power most
 * into an empty socket (free); else upgrade its cheapest affordable equipped
 * item; else add an affordable slot (in `SLOT_ORDER`); else skip (the door).
 */
export function takeBestStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const stop = profile.dive?.stop;
  if (!stop || stop.taken) return profile;
  const take = (action: StopAction) => {
    const res = takeStop(registry, profile, action);
    return res.ok ? res.profile : null;
  };
  if (stop.offers.includes('equip')) {
    const best = bestGain(registry, profile, 'asIs');
    const equipped = best && take({ kind: 'equip', uid: best });
    if (equipped) return equipped;
  }
  if (stop.offers.includes('rune')) {
    const socketed = runeStop(registry, profile, take);
    if (socketed) return socketed;
  }
  if (stop.offers.includes('upgrade')) {
    const cheapest = cheapestUpgrade(registry, profile);
    const upgraded = cheapest && take({ kind: 'upgrade', uid: cheapest.uid });
    if (upgraded) return upgraded;
  }
  if (stop.offers.includes('slot'))
    for (const skill of SLOT_ORDER) {
      const slotted = take({ kind: 'slot', skill });
      if (slotted) return slotted;
    }
  return profile;
}

/**
 * Upgrade its cheapest equipped item while the scrap lasts.
 */
function upgradeAll(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (;;) {
    const cheapest = cheapestUpgrade(registry, p);
    if (!cheapest || cheapest.cost > p.scrap) return p;
    const res = upgradeGear(registry, p, cheapest.uid);
    if (!res.ok) return p; // the forge refuses mid-dive (an open dive)
    p = res.profile;
  }
}

/** The order it forges in, so what matters most gets the best flux first. */
const FORGE_ORDER: readonly GearSlot[] = ['weapon', 'chest', 'helm', 'gloves', 'boots', 'amulet', 'ring'];
/** The slots it forges in its primary (the weapon and two armour pieces); the rest in its secondary, so both grow. */
const PRIMARY_SLOTS: readonly GearSlot[] = ['weapon', 'chest', 'helm'];
/** The least Power (a fraction) a forge must add for the bot to spend its materials on it. */
const MIN_FORGE_GAIN = 0.01;

/** The affixes it wants on an item of `element`, most wanted first: its shards go to these. */
function wanted(p: DelveProfile, element: ManaType): HeroStatKey[] {
  const power = `${p.pair.primary ?? element}Power` as HeroStatKey;
  const attune = `${element}Attune` as HeroStatKey;
  return [
    'damage',
    'damagePct',
    'critChance',
    'critDamage',
    'attackSpeedPct',
    power,
    'maxHp',
    'hpPct',
    'armor',
    'lifesteal',
    'manaRegen',
    'cooldownReduction',
    attune,
  ];
}

/** Its best shard of each affix it wants on `slot`, highest tier first, up to `lines`. */
function shardsFor(
  registry: DataRegistry,
  p: DelveProfile,
  slot: GearSlot,
  element: ManaType,
  lines: number,
): ShardRef[] {
  const out: ShardRef[] = [];
  for (const stat of wanted(p, element)) {
    if (out.length >= lines) break;
    if (!registry.getGearAffix(stat)?.slots.includes(slot)) continue;
    const tiers = p.materials.shards[stat] ?? [];
    for (let tier = tiers.length; tier >= 1; tier--)
      if ((tiers[tier - 1] ?? 0) > 0) {
        out.push({ stat, tier });
        break;
      }
  }
  return out;
}

/**
 * The forge it would make for `slot` with `metal` (by default its highest
 * bar): the slot's own pattern (else the first learned), its best flux (epic
 * with an essence that fits: a legendary), the slot's element by the split and
 * its shards; null without a pattern or a bar.
 */
function planForge(
  registry: DataRegistry,
  p: DelveProfile,
  slot: GearSlot,
  metal = [...METAL_IDS].reverse().find((m) => p.materials.metals[m] > 0),
): ForgeRequest | null {
  const own = p.equipped[slot]?.baseId;
  const baseId =
    own && p.patterns.includes(own)
      ? own
      : registry.getGearBasesForSlot(slot).find((b) => p.patterns.includes(b.id))?.id;
  if (!baseId || !metal) return null;
  const flux = [...FLUX_GRADES].reverse().find((g) => p.materials.flux[g] > 0);
  const essence =
    flux === 'epic'
      ? Object.keys(p.materials.essences).find(
          (id) => p.materials.essences[id] > 0 && registry.getLegendary(id).slots.includes(slot),
        )
      : undefined;
  const { primary, secondary } = p.pair;
  const element = (PRIMARY_SLOTS.includes(slot) ? primary : (secondary ?? primary)) ?? 'fire';
  const rarity: Rarity = essence ? 'legendary' : (flux ?? 'common');
  const lines = registry.getDelveBalance().loot.affixCount[rarity];
  return {
    baseId,
    metal,
    ...(flux ? { flux } : {}),
    ...(essence ? { essence } : {}),
    element,
    shards: shardsFor(registry, p, slot, element, lines),
  };
}

/**
 * Forge `slot`'s planned item with the highest bar it can pay for, when that
 * raises Power by `MIN_FORGE_GAIN` (`compareItem`; a weapon valued as a home
 * for its moveset), whatever the rarities: a better item replaces a low-level
 * legendary. Null when it doesn't forge.
 */
function forgeSlot(registry: DataRegistry, p: DelveProfile, slot: GearSlot): DelveProfile | null {
  for (const metal of [...METAL_IDS].reverse()) {
    if (p.materials.metals[metal] === 0) continue;
    const req = planForge(registry, p, slot, metal);
    if (!req) return null;
    const res = forge(registry, p, req);
    if (!res.ok) continue; // can't pay: a lower bar costs less
    const gain = compareItem(p.equipped, res.item!, registry, referenceDepth(p), p.pair).powerPct;
    return gain >= MIN_FORGE_GAIN ? res.profile : null; // a lower bar only forges lower
  }
  return null;
}

/**
 * Whether it holds an essence and epic flux for a slot it knows a pattern for
 * and can't yet pay to forge it: its scrap waits for the legendary (one it
 * forgoes as no better than what it wears holds nothing back).
 */
function legendaryWaits(registry: DataRegistry, p: DelveProfile): boolean {
  return FORGE_ORDER.some((slot) => {
    const req = planForge(registry, p, slot);
    return req?.essence !== undefined && previewForge(registry, p, req).refused !== null;
  });
}

/**
 * Forge its legendary first (the essence goes into the first slot in
 * `FORGE_ORDER` it fits), then, unless one still waits for its scrap, every
 * other slot it can improve in `FORGE_ORDER`. The new items wait in the bag for
 * the transfer and `equipBest`.
 */
function forgeGear(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  const done = FORGE_ORDER.find((slot) => {
    if (planForge(registry, p, slot)?.essence === undefined) return false;
    const next = forgeSlot(registry, p, slot);
    if (next) p = next;
    return next !== null;
  });
  if (legendaryWaits(registry, p)) return p;
  for (const slot of FORGE_ORDER) if (slot !== done) p = forgeSlot(registry, p, slot) ?? p;
  return p;
}

/**
 * Refine flux up wherever it holds a triple and could still pay to forge its
 * weapon after (else the forge takes the flux as it is), the lowest grade
 * first so a refined one can make a triple above it; and, while its best bar's band ends
 * below its deepest depth (a forge's item level stops there), the highest bar
 * it holds a triple of.
 */
function refineSurplus(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  const step = (ref: Parameters<typeof refine>[2]) => {
    const res = refine(registry, p, ref);
    if (res.ok) p = res.profile;
    return res.ok;
  };
  // Flux only while it can also pay to forge the weapon with the refined grade, on its cheapest
  // bar (else it forges with what it holds).
  const forgeable = (q: DelveProfile) => {
    const req = planForge(registry, q, 'weapon', METAL_IDS.find((m) => q.materials.metals[m] > 0));
    const code = req && previewForge(registry, q, req).refused?.code;
    return code !== 'scrap' && code !== 'dust';
  };
  for (const grade of FLUX_GRADES)
    for (;;) {
      const res = refine(registry, p, { kind: 'flux', grade });
      if (!res.ok || !forgeable(res.profile)) break;
      p = res.profile;
    }
  const metals = [...registry.getCraftingData().metals].reverse();
  const count = registry.getDelveBalance().crafting.refine.metal.count;
  for (;;) {
    const top = metals.find((m) => p.materials.metals[m.id] > 0);
    if (top && (top.band[1] ?? Infinity) >= p.bestDepth) return p;
    const from = metals.find((m) => p.materials.metals[m.id] >= count);
    if (!from || !step({ kind: 'metal', metal: from.id })) return p;
  }
}

/**
 * The shard bench: for each affix it wants on its primary's gear, holding one
 * short of a triple of tier I, it buys the last; then it refines every wanted
 * affix's triples, the lowest tier first.
 */
function refineShards(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  const need = registry.getDelveBalance().crafting.refine.shard.count;
  for (const stat of wanted(p, p.pair.primary ?? 'fire')) {
    if ((p.materials.shards[stat]?.[0] ?? 0) === need - 1) {
      const res = buyShard(registry, p, stat);
      if (res.ok) p = res.profile;
    }
    for (let tier = 1; tier < 5; tier++)
      for (;;) {
        const res = refine(registry, p, { kind: 'shard', stat, tier });
        if (!res.ok) break;
        p = res.profile;
      }
  }
  return p;
}

/**
 * Hone the equipped lines that rolled below their band's middle, the
 * cheapest hone first, while scrap allows (each hone costs more than the last).
 */
function honeGear(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  const minRoll = registry.getDelveBalance().loot.minRoll;
  for (;;) {
    let best: { uid: string; line: number; cost: number } | null = null;
    for (const slot of GEAR_SLOTS) {
      const item = p.equipped[slot];
      if (!item) continue;
      const cost = honeCost(registry, item);
      if (cost > p.scrap || (best && cost >= best.cost)) continue;
      const line = item.affixes.findIndex((a) => {
        const [lo, hi] = a.band ?? [minRoll[item.rarity], 1];
        return a.roll < (lo + hi) / 2;
      });
      if (line >= 0) best = { uid: item.uid, line, cost };
    }
    if (!best) return p;
    const res = hone(registry, p, best.uid, best.line);
    if (!res.ok) return p;
    p = res.profile;
  }
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

/** What went out of the stockpile from `before` to `after`, each count at least 0. */
function outflow(before: DelveProfile, after: DelveProfile): Haul {
  const diff = addHaul(stockOf(before), mapHaul(stockOf(after), (n) => -n));
  return mapHaul(diff, (n) => Math.max(0, n));
}

/** What a visit to the Anvil did: the profile after it, what it claimed and spent, and the items it forged. */
interface AnvilVisit {
  profile: DelveProfile;
  /** What its claims put in the stockpile: quest and contract rewards. */
  quests: Haul;
  /** Each step's net outflow from the stockpile, summed (salvage gives; it spends nothing). */
  spent: Haul;
  forged: GearItem[];
}

/**
 * The Anvil, between dives, as a player would: an overtaking secondary swaps
 * in and a second element is bound (before anything is salvaged); it claims
 * every completed quest and contract (`claimAll`), so their rewards feed what
 * follows; it melts
 * the gear it doesn't wear, refines flux and bars up, forges (a legendary
 * first), moves its moveset to a better weapon and equips upgrades, melts
 * what they replaced; spends Links on slots up to `SOCKETS_AFTER` a chain,
 * then on sockets for the pouch's runes (each filled as it opens), then on the
 * rest of the slots; sockets the best runes and fuses the copies left over;
 * buys and refines shards; hones and pours the rest of the scrap into
 * upgrades (all of that waits while it holds an essence it can't yet pay to
 * forge); and builds the Primary of whatever weapon it wields from both elements.
 */
function anvilVisit(registry: DataRegistry, profile: DelveProfile): AnvilVisit {
  const bound = bindPair(registry, resolveOvertake(registry, profile).profile);
  let p = claimAll(registry, bound);
  const quests = outflow(p, bound); // what came in: the claims spend nothing
  let spent = emptyHaul();
  const pay = (next: DelveProfile) => {
    spent = addHaul(spent, outflow(p, next));
    p = next;
  };
  const melt = () => {
    p = salvageItems(registry, p, salvageCandidates(registry, p, 'epic')).profile;
  };
  melt();
  pay(refineSurplus(registry, p));
  const before = new Set(p.bag.map((i) => i.uid));
  pay(forgeGear(registry, p));
  const forged = p.bag.filter((i) => !before.has(i.uid));
  pay(equipBest(registry, transferBest(registry, p)).profile);
  melt();
  if (!legendaryWaits(registry, p)) {
    // Links: slots up to SOCKETS_AFTER a chain, then sockets for the runes in the pouch, then
    // the rest of the slots. Runes: upgrade the filled sockets, then fuse only the copies left
    // over and socket again (a fused tier can beat a socketed one).
    pay(spendLinks(registry, p, SOCKETS_AFTER));
    pay(openSockets(registry, p));
    pay(spendLinks(registry, p));
    pay(socketBest(registry, p));
    pay(socketBest(registry, fusePouch(registry, p)));
    pay(refineShards(registry, p));
    pay(honeGear(registry, p));
    pay(upgradeAll(registry, p));
  }
  pay(fusePrimary(registry, p));
  return { profile: p, quests, spent, forged };
}
/** What a dive brought into the stockpile: what it banked and kept, and an extract's bounty. */
function diveIncome(p: DelveProfile): Haul {
  const dive = p.dive!;
  const bounty = dive.phase === 'extracted' ? dive.bounty : 0;
  return { ...dive.banked, scrap: dive.banked.scrap + bounty };
}

export function runAutopilot(
  registry: DataRegistry,
  opts: AutopilotOptions,
): { profile: DelveProfile; reports: AutopilotDiveReport[]; economy: EconomyDive[] } {
  const maxDepth = opts.maxDepth ?? 100;
  const maxFloorSeconds = opts.maxFloorSeconds ?? 240;
  let p = opts.profile;
  if (!p) {
    p = createDelveProfile(registry, opts.seed, { primary: opts.primary ?? 'fire' });
    if (opts.secondary) p = fusePrimary(registry, bindSecondary(registry, p, opts.secondary).profile);
    p = betweenDives(registry, p); // the starter kit's forge (the crafting spec's S8)
  }
  const reports: AutopilotDiveReport[] = [];
  const economy: EconomyDive[] = [];

  for (let n = 0; n < opts.dives; n++) {
    const options = startDepthOptions(registry, p);
    const startDepth = options[options.length - 1];
    p = startDive(registry, p, startDepth);
    let seconds = 0;
    let result: AutopilotDiveReport['result'] = 'dead';
    let stops = emptyHaul();

    while (p.dive && (p.dive.phase === 'fighting' || p.dive.phase === 'choosing')) {
      if (p.dive.phase === 'fighting') {
        const played = playFloor(registry, p, maxFloorSeconds);
        p = played.profile;
        seconds += played.seconds;
        continue;
      }
      const before = p;
      p = takeBestStop(registry, p);
      stops = addHaul(stops, outflow(before, p));
      if (p.dive!.depth >= maxDepth) {
        p = extractDive(registry, p);
        result = 'capped';
        break;
      }
      const door = pickDoor(p);
      if (!door) {
        p = extractDive(registry, p);
        result = 'extracted';
        break;
      }
      p = chooseDoor(registry, p, door);
    }

    const dive = p.dive!;
    reports.push({
      dive: n + 1,
      startDepth,
      endDepth: dive.depth,
      result: dive.phase === 'dead' ? 'dead' : result,
      power: profilePower(registry, p),
      kills: dive.kills,
      floorSeconds: Math.round(seconds),
      legendariesOwned: Object.keys(p.codex).length,
      reactionsSeen: p.reactionsSeen.length,
      scrap: p.scrap,
    });
    const visit = anvilVisit(registry, closeDive(registry, p));
    const forged = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const item of visit.forged) forged[item.rarity]++;
    economy.push({
      dive: n + 1,
      income: diveIncome(p),
      quests: visit.quests,
      spent: visit.spent,
      stops,
      lost: dive.lost,
      forged,
      depth: dive.depth,
      died: dive.phase === 'dead',
    });
    p = visit.profile;
  }
  return { profile: p, reports, economy };
}
