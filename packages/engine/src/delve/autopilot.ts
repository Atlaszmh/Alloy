import type { DataRegistry } from '../data/registry.js';
import { BOON_FAMILIES, type BoonFamily } from '../types/boon.js';
import type { DelveProfile, StopKind } from '../types/delve.js';
import type { GearItem, GearSlot, HeroStatKey, Rarity } from '../types/gear.js';
import { GEAR_SLOTS, RARITY_ORDER, rarityIndex } from '../types/gear.js';
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
import { botInput, type BotPolicy } from '../arpg/bot.js';
import { exitFloor } from '../arpg/interact.js';
import { stepWorld } from '../arpg/step.js';
import type { ArpgWorld } from '../types/arpg.js';
import {
  bankWorld,
  beginFloor,
  chooseDoor,
  closeDive,
  completeFloor,
  extractDive,
  failFloor,
  isBossDepth,
  startDepthOptions,
  startDive,
} from './dive.js';
import { compareItem, type WeaponValue } from './hero-stats.js';
import { constructSkill, movesetOf, plainConstruct } from '../loot/moveset.js';
import { bindSecondary, resolveOvertake } from './pair.js';
import {
  createDelveProfile,
  equipBest,
  equipItem,
  profilePower,
  referenceDepth,
  salvageCandidates,
  salvageItems,
  upgradeGear,
} from './profile.js';
import { buyShard, forge, hone, openSkill, refine } from './crafting.js';
import { addSlot, movesOf, setChain, setChains, withMove } from './moveset.js';
import { moveAll, placeConstruct, salvageConstruct } from './constructs.js';
import { fuseRunes, openSocket } from './runes.js';
import { pouchCount, runeFits, socketsOf } from '../loot/runes.js';
import { MAX_SOCKETS } from '../types/rune.js';
import { alcoveOffers, takeAlcove, takeStop, type StopAction } from './stops.js';
import { claimQuest, questStates } from './quests.js';
import {
  MAX_CHAIN,
  MOVE_KINDS,
  type AbilitySlot,
  type Blow,
  type Chains,
  type ChainSkill,
  type Move,
} from '../types/ability.js';
import { RUNE_TIERS, type RuneRef, type RuneTarget, type RuneTier } from '../types/rune.js';
import type { EconomyDive } from './economy.js';
import {
  applyTutorialEvents,
  skipTutorial,
  startTutorial,
  tutorialSkippable,
  tutorialStep,
} from './tutorial.js';
import { worldTutorialEvents } from '../arpg/tutorial.js';
import type { TutorialStep } from '../types/tutorial.js';

/**
 * Plays whole dives with the arena bot, like a sensible player: fights every
 * floor (its gear locked, loot to the bag, materials to the haul), picks
 * doors, extracts when spent, and between dives (and once before the first)
 * visits the Anvil: forges its gear from materials, moves its moveset to a
 * better weapon, salvages what it doesn't wear, adds slots and sockets runes,
 * hones and upgrades (claiming its completed quests and contracts first, never
 * rerolling). With `tutorial` it plays a new save's guided start first. Used by
 * the pacing test, `economySim` and for balance sweeps.
 */

export interface AutopilotOptions {
  seed: number;
  dives: number;
  /** Safety cap on depth per dive. */
  maxDepth?: number;
  /** A floor that runs longer than this counts as a death (default 420). */
  maxFloorSeconds?: number;
  /** How the bot plays a generated floor (default `thorough`). */
  policy?: BotPolicy;
  /** Continue from an existing profile instead of a fresh one (no opening Anvil visit). */
  profile?: DelveProfile;
  /** A fresh profile's starting mana (default fire). */
  primary?: ManaType;
  /** Bind this second element before the first dive (the Primary built from both), forcing the pair. */
  secondary?: ManaType;
  /**
   * A fresh profile plays the guided start (see the tutorial spec's "The bot"): no opening
   * visit; its dives and Anvil lessons follow the script (`secondary`, else Hesta's partner, at
   * the bind), and the dives after it as usual.
   */
  tutorial?: boolean;
}

/** How the guided start went (`runAutopilot`'s `tutorial`; null when it didn't run). */
export interface TutorialRun {
  /** Each guided floor built, as `<floor>@<the dive's depth>` (a retry builds it again). */
  floors: string[];
  /** Each guided stop's power-ups, as offered ([] for none). */
  stops: StopKind[][];
  /** Deaths on guided depths, each retried (`retryTutorialDepth`). */
  retries: number;
  /** The steps it took "Skip this step" on. */
  skippedSteps: string[];
  /** The step it skipped the tutorial on (a fourth death on a depth, or an op it couldn't do). */
  skipped: string | null;
}

/** How many times the bot retries a guided depth before it skips the tutorial. */
const TUTORIAL_RETRIES = 3;

export interface AutopilotDiveReport {
  dive: number;
  startDepth: number;
  endDepth: number;
  result: 'dead' | 'extracted' | 'capped';
  power: number;
  kills: number;
  floorSeconds: number;
  /** Floors that ran to `maxFloorSeconds` (each counted as a death). */
  timedOut: number;
  legendariesOwned: number;
  reactionsSeen: number;
  scrap: number;
}

const DOOR_PREFERENCE = ['winding', 'gilded', 'swarm', 'champions', 'cursed', 'plunge', 'shrine'];
const STEP = 1 / 30;

/**
 * One step of the bot on `world` (`dt` seconds): its input, then what the
 * step asks of it: the gate's `exitRequest` takes the exit at once
 * (`exitFloor`) and an alcove's `alcoveOpen` takes its pick (`takeBestAlcove`).
 * Returns the profile, changed only by an alcove's op.
 */
export function botStep(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  dt: number,
  policy?: BotPolicy,
): DelveProfile {
  let p = profile;
  for (const e of stepWorld(registry, world, botInput(registry, world, policy), dt)) {
    if (e.kind === 'exitRequest') exitFloor(world);
    else if (e.kind === 'alcoveOpen') p = takeBestAlcove(registry, p, world, e.id);
  }
  return p;
}

/**
 * The dive's floor, played to its end; its seconds and its timeouts. A guided
 * depth's death or timeout retries it (`failFloor` returns its entry) up to
 * `TUTORIAL_RETRIES` times, then the bot skips the tutorial and plays the depth
 * as an ordinary one; `run` keeps count. A hand-built floor ends at its gate.
 */
function playFloor(
  registry: DataRegistry,
  profile: DelveProfile,
  maxSeconds: number,
  policy: BotPolicy,
  run: TutorialRun | null,
): { profile: DelveProfile; seconds: number; timedOut: number } {
  let p = profile;
  let seconds = 0;
  let timedOut = 0;
  for (let deaths = 0; ; deaths++) {
    const world = beginFloor(registry, p);
    if (run && world.tutorialFloor) run.floors.push(`${world.tutorialFloor}@${p.dive!.depth}`);
    while (!world.heroDead && world.t < maxSeconds) {
      if (run && world.tutorial) guideWorld(registry, p, world, run);
      p = botStep(registry, p, world, STEP, policy);
      if (world.pending.items.length > 0) p = bankWorld(registry, p, world).profile;
      if (world.exited) break;
      const done = world.drops.length === 0 || world.t - world.clearedAt > 3;
      if (world.cleared && !world.tutorialFloor && done) break;
    }
    seconds += world.t;
    if (!world.heroDead && (world.cleared || world.exited))
      return { profile: completeFloor(registry, p, world).profile, seconds, timedOut };
    if (!world.heroDead) timedOut++;
    const guided = !!(p.tutorial && p.dive?.tutorialEntry);
    p = failFloor(registry, p, world).profile;
    if (!guided || !run) return { profile: p, seconds, timedOut };
    run.retries++;
    if (deaths >= TUTORIAL_RETRIES) {
      run.skipped = p.tutorial!.step;
      p = skipTutorial(p);
    }
  }
}

/**
 * The guided start's beats and skips on a floor, before the bot's step: a
 * beat's Continue (`ack`), and "Skip this step" once it is offered
 * (`tutorialSkippable`).
 */
function guideWorld(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  run: TutorialRun,
): void {
  const state = world.tutorial!;
  if (tutorialStep(registry, state)?.beat) worldTutorialEvents(registry, world, [{ type: 'ack' }]);
  else if (tutorialSkippable(registry, profile, state, world)) {
    run.skippedSteps.push(state.step);
    worldTutorialEvents(registry, world, [{ type: 'skipStep' }]);
  }
}

/**
 * The next door, or null to extract: when spent (low on life, no potions, no
 * shrine), or to bring home the epic flux it has banked, or an essence it has
 * the epic flux to forge (a banked essence is never lost, but a vault's alone
 * isn't worth ending the dive for), or its first boss's haul: a save's first
 * extract (Bring It Home, which the main quests wait on; the first boss's
 * essence and epic flux, which used to bring it home, are gone).
 */
function pickDoor(registry: DataRegistry, profile: DelveProfile): string | null {
  const dive = profile.dive!;
  if (profile.stats.extracts === 0 && isBossDepth(registry, dive.depth)) return null;
  const essence = Object.values(dive.banked.essences).some((n) => n > 0);
  if (dive.banked.flux.epic > 0 || (essence && profile.materials.flux.epic > 0)) return null;
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
  // Every construct, a dormant one too (`heroChains` drops those: an edit would price them as removed).
  const weapon = p.equipped.weapon;
  const chain = weapon && movesetOf(registry, weapon).chains.primary;
  if (!primary || !secondary || !chain || chain.moves.length === 0) return p;
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
 * Move every construct onto the bag weapon that makes the best home (valued
 * with them moved: `compareItem`'s default), when that raises Power (`moveAll`,
 * free; the old weapon goes to the bag refilled plain).
 */
function moveAllBest(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const uid = bestGain(registry, p, 'home', (item) => item.slot === 'weapon');
  if (!uid) return p;
  const res = moveAll(registry, p, uid);
  return res.ok ? res.profile : p;
}

/**
 * Place the bag's constructs where they raise Power most (`placeConstruct`,
 * free): each round every bag construct is tried in every slot of its skill on
 * the worn weapon (an empty one, or a full chain's, whose construct goes to the
 * bag), the best gain taken, until none gains. A dormant placement is refused
 * by the op (the wrong class), so it never tries to play one.
 */
function placeBag(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (;;) {
    const weapon = p.equipped.weapon;
    if (!weapon || p.constructs.length === 0) return p;
    const { slots } = movesetOf(registry, weapon);
    const now = profilePower(registry, p);
    let best: { profile: DelveProfile; power: number } | null = null;
    for (const c of p.constructs) {
      const skill = constructSkill(registry, c);
      for (let index = 0; index < (slots[skill] ?? 0); index++) {
        const res = placeConstruct(registry, p, c.uid!, skill, index);
        const power = res.ok ? profilePower(registry, res.profile) : 0;
        if (res.ok && power > (best?.power ?? now)) best = { profile: res.profile, power };
      }
    }
    if (!best) return p;
    p = best.profile;
  }
}

/**
 * Fill the worn weapon's empty slots (a chain shorter than its slots: the
 * target's own went to the bag in a Move all) with plain constructs in the
 * primary (`plainConstruct`, `editDust` each through `setChain`), a skill at a
 * time in `SLOT_ORDER`, when it can pay and Power rises.
 */
function fillEmpty(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  const primary = p.pair.primary;
  if (!p.equipped.weapon || !primary) return p;
  for (const skill of SLOT_ORDER) {
    const weapon = p.equipped.weapon!;
    const { chains, slots } = movesetOf(registry, weapon);
    const chain = chains[skill];
    const moves = movesOf(chain);
    const n = slots[skill] ?? 0;
    if (!chain || moves.length >= n) continue;
    const added = Array.from({ length: n - moves.length }, (_, i) =>
      plainConstruct(registry, weapon, skill, moves.length + i, primary),
    );
    const next = (
      Array.isArray(chain) ? [...chain, ...added] : { ...chain, moves: [...chain.moves, ...added] }
    ) as Chains[ChainSkill];
    const res = setChain(registry, p, skill, next);
    if (res.ok && profilePower(registry, res.profile) > profilePower(registry, p)) p = res.profile;
  }
  return p;
}

/**
 * Melt every construct left in the bag (`salvageConstruct`: its runes back to
 * the pouch at the pull price; refused while the scrap for them isn't there).
 */
function salvageBag(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (const c of profile.constructs) {
    const res = salvageConstruct(registry, p, c.uid!);
    if (res.ok) p = res.profile;
  }
  return p;
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
  const cap = profile.equipped.weapon ? MAX_SOCKETS : 0;
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

/** A boons stop's tie-break by family (the boons spec §5); a pact is never taken. */
const BOON_ORDER: readonly BoonFamily[] = ['offense', 'defense', 'element', 'tempo', 'fortune', 'floor'];

/**
 * At a stop between depths. A boons stop: the boon of the highest tier, ties by
 * family in `BOON_ORDER`, never a pact (nothing taken when only pacts are
 * offered). A power-up stop, by preference: equip the bag item that beats its
 * gear the most as it is; else socket the pouch rune that raises Power most
 * into an empty socket (free); else upgrade its cheapest affordable equipped
 * item; else add an affordable slot (in `SLOT_ORDER`); else skip (the door).
 */
export function takeBestStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const stop = profile.dive?.stop;
  if (stop?.kind === 'boons') {
    if (stop.taken) return profile;
    // An id the data lacks (or a pact) has no place in BOON_ORDER: passed over.
    const best = stop.offers
      .map((o, index) => {
        const family = registry.getBoon(o.id)?.family;
        return { index, tier: o.tier, order: family ? BOON_ORDER.indexOf(family) : -1 };
      })
      .filter((o) => o.order >= 0)
      .sort((a, b) => b.tier - a.tier || a.order - b.order)[0];
    const res = best && takeStop(registry, profile, { kind: 'boon', index: best.index });
    return res?.ok ? res.profile : profile;
  }
  return bestStop(registry, profile, (action) => {
    const res = takeStop(registry, profile, action);
    return res.ok ? res.profile : null;
  });
}

/**
 * At an anvil alcove mid-floor, the bot's pick (the stop's preference ladder over
 * `alcoveOffers`), taken through `takeAlcove`. The world banks first, as the client's does
 * before it opens the alcove, so the offers count what the floor has picked up; the banked
 * profile comes back when it takes nothing. The ladder runs on a dry run: the profile as if
 * at a stop offering the alcove's kinds, its floor's haul banked.
 */
export function takeBestAlcove(
  registry: DataRegistry,
  unbanked: DelveProfile,
  world: ArpgWorld,
  id: string,
): DelveProfile {
  if (!unbanked.dive) return unbanked;
  const profile = bankWorld(registry, unbanked, world).profile;
  const dive = profile.dive;
  const offers = alcoveOffers(registry, profile, world, id);
  if (!dive || offers.length === 0) return profile;
  const stop = { kind: 'powerups' as const, offers, taken: false };
  const banked = addHaul(dive.banked, dive.haul);
  const atStop: DelveProfile = { ...profile, dive: { ...dive, phase: 'choosing', banked, stop } };
  const picks = new Map<DelveProfile, StopAction>();
  const picked = bestStop(registry, atStop, (action) => {
    const res = takeStop(registry, atStop, action);
    if (res.ok) picks.set(res.profile, action);
    return res.ok ? res.profile : null;
  });
  const action = picks.get(picked);
  return action ? takeAlcove(registry, profile, world, action).profile : profile;
}

/** `takeBestStop`'s ladder over `profile`'s stop, each kind tried through `take`. */
function bestStop(
  registry: DataRegistry,
  profile: DelveProfile,
  take: (action: StopAction) => DelveProfile | null,
): DelveProfile {
  const stop = profile.dive?.stop;
  if (!stop || stop.taken || stop.kind !== 'powerups') return profile;
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
 * A guided stop's power-up (see the tutorial spec's gates): the stop's ladder
 * (`takeBestStop`); where that takes nothing, the first offer it can take: a
 * bag item equipped, an item upgraded, or (Adjust a move) the Primary move's
 * kind changed that leaves Power highest.
 */
function takeGuidedStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const laddered = takeBestStop(registry, profile);
  const stop = laddered.dive?.stop;
  if (!stop || stop.taken || stop.kind !== 'powerups') return laddered;
  const take = (action: StopAction) => {
    const res = takeStop(registry, profile, action);
    return res.ok ? res.profile : null;
  };
  const items = [...GEAR_SLOTS.flatMap((s) => profile.equipped[s] ?? []), ...profile.bag];
  const actions: Exclude<StopAction, { kind: 'boon' }>[] = [
    ...profile.bag.map((i) => ({ kind: 'equip', uid: i.uid }) as const),
    ...items.map((i) => ({ kind: 'upgrade', uid: i.uid }) as const),
  ];
  for (const action of actions.filter((a) => stop.offers.includes(a.kind))) {
    const taken = take(action);
    if (taken) return taken;
  }
  const weapon = profile.equipped.weapon;
  const chain = weapon && movesetOf(registry, weapon).chains.primary;
  let best: { profile: DelveProfile; power: number } | null = null;
  if (stop.offers.includes('move') && chain)
    for (const [index, move] of chain.moves.entries())
      for (const kind of MOVE_KINDS) {
        if (kind === move.kind) continue;
        const taken = take({ kind: 'move', skill: 'primary', index, move: { ...move, kind } });
        const power = taken ? profilePower(registry, taken) : 0;
        if (taken && power > (best?.power ?? -Infinity)) best = { profile: taken, power };
      }
  return best?.profile ?? profile;
}

/**
 * Open each ability skill the worn weapon has no slot for (`openSkill`, in
 * `SLOT_ORDER`: the Primary, the Ultimate, then the Defensive) when it can pay
 * and Power rises (see the constructs spec §7); the slot arrives plain-filled.
 */
function openSkills(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (const skill of SLOT_ORDER.filter((s): s is AbilitySlot => s !== 'basic')) {
    const weapon = p.equipped.weapon;
    if (!weapon || (movesetOf(registry, weapon).slots[skill] ?? 0) > 0) continue;
    const res = openSkill(registry, p, weapon.uid, skill);
    if (res.ok && profilePower(registry, res.profile) > profilePower(registry, p)) p = res.profile;
  }
  return p;
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
  return { ...p.materials, scrap: p.scrap, dust: p.manaDust, links: p.links, runes: p.runes, constructs: [] };
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
    constructs: [],
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
  /** The bag's constructs it placed on the worn weapon, and those it melted. */
  constructs: { placed: number; salvaged: number };
}

/**
 * The Anvil, between dives, as a player would: an overtaking secondary swaps
 * in and a second element is bound (before anything is salvaged); it claims
 * every completed quest and contract (`claimAll`), so their rewards feed what
 * follows; it melts
 * the gear it doesn't wear, refines flux and bars up, forges (a legendary
 * first), moves every construct to a better weapon (`moveAllBest`) and equips
 * upgrades, melts what they replaced; opens the skills it can pay for
 * (`openSkills`); places the bag's constructs where they gain (`placeBag`) and
 * melts the rest (`salvageBag`); fills the slots left empty (`fillEmpty`);
 * spends Links on slots up to `SOCKETS_AFTER` a chain (each under its
 * ceiling), then on sockets for the pouch's runes (each filled as it opens),
 * then on the rest of the slots; sockets the best runes and fuses the copies left over;
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
  pay(equipBest(registry, moveAllBest(registry, p)).profile);
  melt();
  if (!legendaryWaits(registry, p)) pay(openSkills(registry, p));
  // The bag's constructs (a melted weapon's, a Move all's): placed where they gain, free; the
  // rest melted, their runes back in the pouch before the sockets fill.
  const bagged = p.constructs.length;
  p = placeBag(registry, p);
  const placed = bagged - p.constructs.length;
  const left = p.constructs.length;
  pay(salvageBag(registry, p));
  const salvaged = left - p.constructs.length;
  if (!legendaryWaits(registry, p)) {
    pay(fillEmpty(registry, p));
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
  return { profile: p, quests, spent, forged, constructs: { placed, salvaged } };
}

/**
 * An Anvil lesson step's op (see the tutorial spec's lessons), by its trigger:
 * claim what waits; forge the slot's item (`planForge`, its best flux, the
 * highest bar it can pay for); wear it; bind `secondary` (else Hesta's
 * partner); the Skills lesson (`lessonChain`); salvage the slot's items of the
 * rarity; refine into the metal; transfer onto the bag weapon of the rarity;
 * hone the cheapest worn item's first line; a beat's Continue; the Training
 * Grounds' cast. A step whose state holds completes in the op it calls.
 */
function lessonOp(
  registry: DataRegistry,
  p: DelveProfile,
  step: TutorialStep,
  secondary: ManaType | undefined,
): DelveProfile {
  const f = step.trigger.filter ?? {};
  const slot = f.slot as GearSlot;
  const atLeast = (i: GearItem) => rarityIndex(i.rarity) >= rarityIndex(f.rarity as Rarity);
  const weapons = p.bag.filter((i) => i.slot === 'weapon' && atLeast(i));
  switch (step.trigger.type) {
    case 'claim':
      return claimAll(registry, p);
    case 'forge':
      for (const metal of [...METAL_IDS].reverse()) {
        const req = p.materials.metals[metal] > 0 && planForge(registry, p, slot, metal);
        const res = req && forge(registry, p, req);
        if (res && res.ok) return res.profile;
      }
      return p;
    case 'equip': {
      const item = p.bag.find((i) => i.slot === slot && atLeast(i));
      return item ? equipItem(registry, p, item.uid) : p;
    }
    case 'bind': {
      const partner = registry.getTutorialData().partners[p.pair.primary!];
      return bindSecondary(registry, p, secondary ?? partner).profile;
    }
    case 'setChains':
      return lessonChain(registry, p, Number(f.moves));
    case 'salvage': {
      const old = p.bag.filter((i) => i.slot === slot && i.rarity === f.rarity);
      return salvageItems(registry, p, old.map((i) => i.uid)).profile;
    }
    case 'refine': {
      const metals = registry.getCraftingData().metals;
      const from = metals[metals.findIndex((m) => m.id === f.metal) - 1];
      return from ? refine(registry, p, { kind: 'metal', metal: from.id }).profile : p;
    }
    case 'moveAll': {
      // D1 rewires to moveAll (B2's op): the step is skipped meanwhile.
      const uid = bestGain(registry, p, 'home', (i) => weapons.includes(i)) ?? weapons[0]?.uid;
      return uid ? p : p;
    }
    case 'hone': {
      const worn = GEAR_SLOTS.flatMap((s) => p.equipped[s] ?? []).filter((i) => i.affixes.length);
      const item = worn.sort((a, b) => honeCost(registry, a) - honeCost(registry, b))[0];
      return item ? hone(registry, p, item.uid, 0).profile : p;
    }
    case 'ack':
      return applyTutorialEvents(registry, p, [{ type: 'ack' }]);
    case 'cast': {
      const cast = { type: 'cast', slot: Number(f.slot ?? 0), step: 0, aimed: false } as const;
      return applyTutorialEvents(registry, p, [cast]);
    }
    default:
      return p;
  }
}

/**
 * The Skills lesson: the Primary grown to `moves` moves (`addSlot`), its last
 * in the secondary, and a pouch rune that fits its first move in that move's
 * first socket (the Apply opens it).
 */
function lessonChain(registry: DataRegistry, profile: DelveProfile, moves: number): DelveProfile {
  let p = profile;
  const weapon = () => p.equipped.weapon;
  while (weapon() && (movesetOf(registry, weapon()!).slots.primary ?? 0) < moves) {
    const res = addSlot(registry, p, 'primary');
    if (!res.ok) break;
    p = res.profile;
  }
  const chain = weapon() && movesetOf(registry, weapon()!).chains.primary;
  const second = p.pair.secondary;
  if (!chain || !second) return p;
  const first = chain.moves[0];
  const held = socketsOf(first).some((r) => r !== null);
  const rune = held ? undefined : pouchBest(registry, p).find((r) => takes(registry, p, first, 0, r));
  const last = chain.moves.length - 1;
  const next = chain.moves.map((m, i) => ({
    ...m,
    ...(i === last && { elements: [second] }),
    ...(i === 0 && rune && { runes: [rune, ...socketsOf(m).slice(1)] }),
  }));
  return setChains(registry, p, { primary: { ...chain, moves: next } }).profile;
}

/**
 * An Anvil visit while the guided start runs: each lesson step's op
 * (`lessonOp`) in the script's order, until the step waits for the dive
 * (`reachDepth`) or the tutorial ends. A step its op doesn't complete takes
 * "Skip this step" where it is offered, else the bot skips the tutorial
 * (`run.skipped`). Nothing else happens on that visit.
 */
function lessonVisit(
  registry: DataRegistry,
  profile: DelveProfile,
  secondary: ManaType | undefined,
  run: TutorialRun,
): AnvilVisit {
  let p = profile;
  let quests = emptyHaul();
  let spent = emptyHaul();
  const held = (q: DelveProfile) => [...GEAR_SLOTS.flatMap((s) => q.equipped[s] ?? []), ...q.bag];
  const before = new Set(held(p).map((i) => i.uid));
  for (let step = tutorialStep(registry, p.tutorial); step; step = tutorialStep(registry, p.tutorial)) {
    if (step.trigger.type === 'reachDepth') break;
    const next = lessonOp(registry, p, step, secondary);
    // A claim's rewards come in; every other op's price goes out.
    if (step.trigger.type === 'claim') quests = addHaul(quests, outflow(next, p));
    else spent = addHaul(spent, outflow(p, next));
    p = next;
    if (p.tutorial?.step !== step.id) continue;
    if (tutorialSkippable(registry, p, p.tutorial)) {
      run.skippedSteps.push(step.id);
      p = applyTutorialEvents(registry, p, [{ type: 'skipStep' }]);
    } else {
      run.skipped = step.id;
      p = skipTutorial(p);
    }
  }
  return {
    profile: p,
    quests,
    spent,
    forged: held(p).filter((i) => !before.has(i.uid)),
    constructs: { placed: 0, salvaged: 0 },
  };
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
): {
  profile: DelveProfile;
  reports: AutopilotDiveReport[];
  economy: EconomyDive[];
  tutorial: TutorialRun | null;
} {
  const maxDepth = opts.maxDepth ?? 100;
  const maxFloorSeconds = opts.maxFloorSeconds ?? 420;
  let p = opts.profile;
  if (!p) {
    p = createDelveProfile(registry, opts.seed, { primary: opts.primary ?? 'fire' });
    if (opts.tutorial) p = startTutorial(registry, p);
    else {
      if (opts.secondary) p = fusePrimary(registry, bindSecondary(registry, p, opts.secondary).profile);
      p = betweenDives(registry, p); // the starter kit's forge (the crafting spec's S8)
    }
  }
  const run: TutorialRun | null = p.tutorial
    ? { floors: [], stops: [], retries: 0, skippedSteps: [], skipped: null }
    : null;
  const reports: AutopilotDiveReport[] = [];
  const economy: EconomyDive[] = [];

  for (let n = 0; n < opts.dives; n++) {
    const options = startDepthOptions(registry, p);
    const startDepth = options[options.length - 1];
    p = startDive(registry, p, startDepth);
    let seconds = 0;
    let timedOut = 0;
    let result: AutopilotDiveReport['result'] = 'dead';
    let stops = emptyHaul();
    const boons = Object.fromEntries(BOON_FAMILIES.map((f) => [f, 0])) as Record<BoonFamily, number>;

    while (p.dive && (p.dive.phase === 'fighting' || p.dive.phase === 'choosing')) {
      if (p.dive.phase === 'fighting') {
        const played = playFloor(registry, p, maxFloorSeconds, opts.policy ?? 'thorough', run);
        p = played.profile;
        seconds += played.seconds;
        timedOut += played.timedOut;
        continue;
      }
      const before = p;
      // A guided stop: its power-up, then its one road (Extract, or a door); never `closeDive`.
      const guided = tutorialStep(registry, p.tutorial)?.stop;
      const stop = p.dive!.stop;
      if (guided) run?.stops.push(stop?.kind === 'powerups' ? stop.offers : []);
      p = guided ? takeGuidedStop(registry, p) : takeBestStop(registry, p);
      stops = addHaul(stops, outflow(before, p));
      for (const b of p.dive!.diveBuffs.slice(before.dive!.diveBuffs.length)) {
        const family = registry.getBoon(b.boon)?.family;
        if (family) boons[family]++;
      }
      if (guided?.extract) {
        p = extractDive(registry, p);
        result = 'extracted';
        break;
      }
      if (guided) {
        const doors = p.dive!.doorChoices;
        p = chooseDoor(registry, p, DOOR_PREFERENCE.find((id) => doors.includes(id)) ?? doors[0]);
        continue;
      }
      if (p.dive!.depth >= maxDepth) {
        p = extractDive(registry, p);
        result = 'capped';
        break;
      }
      const door = pickDoor(registry, p);
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
      timedOut,
      legendariesOwned: Object.keys(p.codex).length,
      reactionsSeen: p.reactionsSeen.length,
      scrap: p.scrap,
    });
    const closed = closeDive(registry, p);
    const visit =
      run && closed.tutorial
        ? lessonVisit(registry, closed, opts.secondary, run)
        : anvilVisit(registry, closed);
    const forged = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const item of visit.forged) forged[item.rarity]++;
    economy.push({
      dive: n + 1,
      income: diveIncome(p),
      quests: visit.quests,
      spent: visit.spent,
      stops,
      boons,
      lost: dive.lost,
      forged,
      constructs: visit.constructs,
      depth: dive.depth,
      died: dive.phase === 'dead',
    });
    p = visit.profile;
  }
  return { profile: p, reports, economy, tutorial: run };
}
