import type { DataRegistry } from '../data/registry.js';
import type { FloorOptions } from '../arpg/world.js';
import { nextMove } from '../arpg/abilities/cast.js';
import { setDoor } from '../arpg/grid.js';
import { honeCost, previewForge } from '../loot/forge.js';
import { materialCount, refineCost } from '../loot/materials.js';
import { baseSlots, movesetOf, movesetTransfer } from '../loot/moveset.js';
import { socketsOf } from '../loot/runes.js';
import type { Move } from '../types/ability.js';
import type { ArpgWorld } from '../types/arpg.js';
import type { FluxGrade, MetalId } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import {
  GEAR_SLOTS,
  rarityIndex,
  type GearItem,
  type GearSlot,
  type Rarity,
} from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import type {
  TutorialEvent,
  TutorialInput,
  TutorialState,
  TutorialStep,
  TutorialText,
  TutorialTextPart,
} from '../types/tutorial.js';
import { movesOf, slotPrice } from './moveset.js';
import { applyQuestEvents, questStates } from './quests.js';

/**
 * The guided start on the profile (see the tutorial spec): starting and
 * skipping it, its one rule, the state its steps read, its text, the retry,
 * and the hooks the dive and the Anvil's ops call. dive.ts, quests.ts and the
 * ops import this module and it imports them back: keep to function
 * declarations.
 */

/**
 * Every weapon's pattern learned: a weapon is the hero's identity, so outside
 * the guided start every one is forgeable from the first visit (a Jump in
 * save, a finished or skipped guided start, and any such save at load). The
 * guided start itself keeps to the kit's patterns. Quests read the new count.
 */
export function learnWeaponPatterns(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const weapons = registry.getGearBasesForSlot('weapon').map((b) => b.id);
  const missing = weapons.filter((id) => !profile.patterns.includes(id));
  if (missing.length === 0) return profile;
  return applyQuestEvents(registry, { ...profile, patterns: [...profile.patterns, ...missing] }, []);
}

/** Why the Anvil's Delve waits while a lesson runs (`tutorialBlocksDive`). */
export const LESSON_UNFINISHED = "Finish Hesta's lesson or skip it";

/**
 * The triggers whose step completes by what holds on the profile
 * (`tutorialHolds`), never by counting their events: the trigger's filter
 * names what it reads.
 */
const BY_STATE: ReadonlySet<string> = new Set([
  'claim',
  'forge',
  'equip',
  'bind',
  'setChains',
  'salvage',
  'refine',
  'transfer',
  'hone',
]);

/** The step `state` is on, or null (no tutorial, or a step the script no longer has). */
export function tutorialStep(
  registry: DataRegistry,
  state: Pick<TutorialState, 'step'> | null,
): TutorialStep | null {
  return state ? (registry.getTutorialData().steps.find((s) => s.id === state.step) ?? null) : null;
}

/** The state once `state`'s step completes: the next step at a count of 0, or null after the last. */
export function tutorialNext(registry: DataRegistry, state: TutorialState): TutorialState | null {
  const steps = registry.getTutorialData().steps;
  const next = steps[steps.findIndex((s) => s.id === state.step) + 1];
  return next ? { step: next.id, count: 0, misses: 0 } : null;
}

/** Whether `event` is `trigger`'s: its type, and each of the filter's fields equal to the event's. */
export function triggerMatches(
  trigger: { type: string; filter?: Record<string, string | number | boolean> },
  event: { type: string },
): boolean {
  const fields = event as unknown as Record<string, unknown>;
  return (
    event.type === trigger.type &&
    Object.entries(trigger.filter ?? {}).every(([k, v]) => fields[k] === v)
  );
}

/**
 * A new save's guided start: its first step (`tutorial.json → steps[0]`), the
 * patterns back to the kit's (`startingPatterns`) until it ends.
 */
export function startTutorial(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const first = registry.getTutorialData().steps[0];
  const patterns = [...registry.getCraftingData().startingPatterns];
  return applyTutorialEvents(
    registry,
    { ...profile, patterns, tutorial: { step: first.id, count: 0, misses: 0 } },
    [],
  );
}

/**
 * Drop the rails: the profile's tutorial cleared, with its depth's entry and a
 * stop's required power-up, and `world`'s (a floor in progress plays out, its
 * held doors let go); the save is ordinary from here, every weapon's pattern
 * learned (`learnWeaponPatterns`).
 */
export function skipTutorial(
  registry: DataRegistry,
  profile: DelveProfile,
  world?: ArpgWorld | null,
): DelveProfile {
  if (world) {
    world.tutorial = null;
    for (const d of world.map.doors) setDoor(world.map, d, 'held', false);
  }
  const dive = profile.dive;
  return learnWeaponPatterns(registry, {
    ...profile,
    tutorial: null,
    dive: dive && {
      ...dive,
      tutorialEntry: null,
      stop: dive.stop && { ...dive.stop, required: false },
    },
  });
}

/**
 * The one rule: `state` after `event`. A matching event (its trigger's type,
 * every filter entry equal) grows the current step's count, which completes it
 * at the trigger's count; the next step becomes current at a count of 0.
 * `skipStep` completes the step (the caller checks `tutorialSkippable`).
 * Leaving a floor (`clearFloor`) completes what is left of its floor steps,
 * and leaving a stop (a door's `reachDepth`, or `extract`) its stop steps. A
 * step that completes by state (`tutorialHolds`) never counts events. Null
 * once the last step completes.
 */
export function tutorialAdvance(
  registry: DataRegistry,
  state: TutorialState,
  event: TutorialEvent,
): TutorialState | null {
  const step = tutorialStep(registry, state);
  if (!step) return state;
  if (event.type === 'skipStep') return tutorialNext(registry, state);
  const leaves =
    (event.type === 'clearFloor' && step.where === 'floor') ||
    ((event.type === 'reachDepth' || event.type === 'extract') && step.where === 'stop');
  if (leaves) {
    let s: TutorialState | null = state;
    while (s) {
      const cur = tutorialStep(registry, s);
      if (cur?.where !== step.where || cur.floor !== step.floor) break;
      s = tutorialNext(registry, s);
    }
    return s;
  }
  if (BY_STATE.has(step.trigger.type) || !triggerMatches(step.trigger, event)) return state;
  const count = state.count + 1;
  return count >= step.trigger.count ? tutorialNext(registry, state) : { ...state, count };
}

/**
 * The profile with `events` applied to its tutorial (`tutorialAdvance`; a
 * `skipStep` only while `tutorialSkippable`), then each step whose state holds
 * (`tutorialHolds`) completed in turn, so a step done before it became
 * current completes as it does. With no tutorial running, or nothing moved,
 * the profile itself. Every op that emits quest events calls it beside
 * `applyQuestEvents`, with the same events and its own; the client calls it
 * for a beat's `ack`, a `skipStep` and the Training Grounds' cast.
 */
export function applyTutorialEvents(
  registry: DataRegistry,
  profile: DelveProfile,
  events: readonly TutorialEvent[],
): DelveProfile {
  let state = profile.tutorial;
  if (!state) return profile;
  for (const e of events) {
    if (!state) break;
    if (e.type === 'skipStep' && !tutorialSkippable(registry, profile, state)) continue;
    state = tutorialAdvance(registry, state, e);
  }
  for (
    let step = tutorialStep(registry, state);
    state && step && tutorialHolds(registry, profile, step);
    step = tutorialStep(registry, state)
  )
    state = tutorialNext(registry, state);
  if (state === profile.tutorial) return profile;
  // The guided start's end: the save is ordinary from here.
  return state ? { ...profile, tutorial: state } : learnWeaponPatterns(registry, { ...profile, tutorial: null });
}

/** What the hero has: worn, then the bag. */
function itemsOf(profile: DelveProfile): GearItem[] {
  const worn = GEAR_SLOTS.map((s) => profile.equipped[s]).filter((i): i is GearItem => !!i);
  return [...worn, ...profile.bag];
}

const atLeast = (item: GearItem | undefined, rarity: unknown) =>
  !!item && rarityIndex(item.rarity) >= rarityIndex(rarity as Rarity);

/** The equipped weapon's Primary moves (none unarmed, or when it carries no Primary). */
function primaryMoves(registry: DataRegistry, profile: DelveProfile): Move[] {
  const weapon = profile.equipped.weapon;
  return weapon ? (movesOf(movesetOf(registry, weapon).chains.primary) as Move[]) : [];
}

/**
 * Whether step `step`'s state holds on the profile (see the tutorial spec's
 * "Completion reads what holds"), by its trigger and what its filter names:
 * `claim` nothing left to claim; `forge` an item of `slot` at `rarity` or
 * better, worn or in the bag (the starting gear is common); `equip` one worn;
 * `bind` a secondary bound; `setChains` the Primary at `moves` moves, its last
 * in the secondary and a rune in its first; `salvage` no item of `slot` and
 * exactly `rarity` left; `refine` a bar of `metal`; `transfer` a weapon of
 * `rarity` or better equipped, its Primary past its base slots (the moveset
 * moved onto it); `hone` an item honed. Any other step has no
 * state: false (it waits for its event, or a floor's tallies).
 */
export function tutorialHolds(
  registry: DataRegistry,
  profile: DelveProfile,
  step: TutorialStep,
): boolean {
  const f = step.trigger.filter ?? {};
  const items = itemsOf(profile);
  switch (step.trigger.type) {
    case 'claim':
      return !questStates(registry, profile).some((q) => q.status === 'complete');
    case 'forge':
      return items.some((i) => i.slot === f.slot && atLeast(i, f.rarity));
    case 'equip':
      return atLeast(profile.equipped[f.slot as GearSlot], f.rarity);
    case 'bind':
      return profile.pair.secondary !== null;
    case 'setChains': {
      const moves = primaryMoves(registry, profile);
      const secondary = profile.pair.secondary;
      return (
        moves.length >= Number(f.moves) &&
        !!secondary &&
        moves[moves.length - 1].elements.includes(secondary) &&
        socketsOf(moves[0]).some((r) => r !== null)
      );
    }
    case 'salvage':
      return !items.some((i) => i.slot === f.slot && i.rarity === f.rarity);
    case 'refine':
      return materialCount(profile.materials, { kind: 'metal', metal: f.metal as MetalId }) > 0;
    case 'transfer': {
      // The moveset moved with it: a plain Equip leaves the Primary at its base slots.
      const weapon = profile.equipped.weapon;
      return (
        atLeast(weapon, f.rarity) &&
        primaryMoves(registry, profile).length > baseSlots(registry, weapon!.baseId, 'primary')
      );
    }
    case 'hone':
      return items.some((i) => i.hones > 0);
    default:
      return false;
  }
}

/**
 * Whether the hero can't do an Anvil step's op as the lesson asks
 * (`tutorialSkippable`): a forge of the cheapest bar at the step's rarity (an
 * equip too, with nothing of the slot and rarity to wear); the Skills step on
 * a weapon that can't hold its moves, or its slot, socket, elements and a
 * pouch rune for what is left of it; the refine into `metal`; the transfer
 * onto a bag weapon of `rarity`; any hone. Generous by design: it only offers
 * "Skip this step".
 */
function unaffordable(registry: DataRegistry, profile: DelveProfile, step: TutorialStep): boolean {
  const f = step.trigger.filter ?? {};
  const bal = registry.getDelveBalance();
  const { primary, secondary } = profile.pair;
  const weapon = profile.equipped.weapon;
  // With nothing to wear, an equip is as unaffordable as the forge that would make it.
  const owned = itemsOf(profile).some((i) => i.slot === f.slot && atLeast(i, f.rarity));
  switch (step.trigger.type === 'equip' && !owned ? 'forge' : step.trigger.type) {
    case 'forge': {
      const base = profile.patterns.find((id) => registry.getGearBase(id).slot === f.slot);
      if (!base || !primary) return true;
      const metal = registry.getCraftingData().metals[0].id;
      const req = {
        baseId: base,
        metal,
        flux: f.rarity as FluxGrade,
        element: primary,
        shards: [],
      };
      const refused = previewForge(registry, profile, req).refused;
      return !!refused && refused.code !== 'bagFull';
    }
    case 'setChains': {
      if (!secondary) return false;
      // A weapon that can't hold the moves (unarmed, no Primary, every slot bought) can't do it.
      const moves = primaryMoves(registry, profile);
      const short = moves.length < Number(f.moves);
      const slot = weapon && short ? slotPrice(registry, weapon, 'primary') : null;
      if (!weapon || moves.length === 0 || (short && !slot)) return true;
      const socket = moves.length > 0 && socketsOf(moves[0]).length === 0;
      const links = (slot?.links ?? 0) + (socket ? bal.runes.socketLinks[0] : 0);
      const scrap = (slot?.scrap ?? 0) + (socket ? bal.runes.socketScrap[0] : 0);
      const last = moves.length >= Number(f.moves) ? moves[moves.length - 1] : undefined;
      const dust = last?.elements.includes(secondary) ? 0 : bal.movesets.elementDust;
      const rune =
        (moves.length > 0 && socketsOf(moves[0]).some((r) => r !== null)) ||
        Object.values(profile.runes).some((tiers) => tiers.some((n) => n > 0));
      return profile.links < links || profile.scrap < scrap || profile.manaDust < dust || !rune;
    }
    case 'refine': {
      const metals = registry.getCraftingData().metals;
      const from = metals[metals.findIndex((m) => m.id === f.metal) - 1];
      if (!from) return true;
      const ref = { kind: 'metal', metal: from.id } as const;
      const cost = refineCost(registry, ref)!;
      return materialCount(profile.materials, ref) < cost.count || profile.scrap < cost.scrap;
    }
    case 'transfer': {
      const target = profile.bag.find((i) => i.slot === 'weapon' && atLeast(i, f.rarity));
      return !weapon || !target || movesetTransfer(registry, weapon, target).scrap > profile.scrap;
    }
    case 'hone':
      return !itemsOf(profile).some(
        (i) => i.affixes.length > 0 && honeCost(registry, i) <= profile.scrap,
      );
    default:
      return false;
  }
}

/** The floor triggers a foe must be alive for: with every foe dead, their step can't complete. */
const NEEDS_FOES: ReadonlySet<string> = new Set(['kill', 'boss', 'reaction', 'perfectDodge']);

/**
 * Whether "Skip this step" is offered for `state` (the profile's, or a floor's
 * `world.tutorial`): its misses at the step's `skipAfter`, a floor step that
 * needs foes with every foe on `world`'s floor dead, or an Anvil step whose op
 * the hero can't do. False with no tutorial.
 */
export function tutorialSkippable(
  registry: DataRegistry,
  profile: DelveProfile,
  state: TutorialState,
  world?: ArpgWorld | null,
): boolean {
  const step = tutorialStep(registry, state);
  if (!step) return false;
  if (step.where === 'floor') return floorSkippable(registry, state, world);
  if (step.skipAfter !== undefined && state.misses >= step.skipAfter) return true;
  return step.where === 'anvil' && unaffordable(registry, profile, step);
}

/**
 * `tutorialSkippable` for a floor step (`worldTutorialEvents`' too): its misses
 * at its `skipAfter`, or its trigger needing foes and none left alive on `world`.
 */
export function floorSkippable(
  registry: DataRegistry,
  state: TutorialState,
  world?: ArpgWorld | null,
): boolean {
  const step = tutorialStep(registry, state);
  if (!step) return false;
  if (step.skipAfter !== undefined && state.misses >= step.skipAfter) return true;
  return !!world && NEEDS_FOES.has(step.trigger.type) && !world.monsters.some((m) => !m.dead);
}

/**
 * A tutorial death, Abandon or floor restart: the profile as it entered the
 * depth (`DiveState.tutorialEntry`), everything the floor banked reverted (the
 * bag, patterns, materials, reactions seen, quest progress, the step), the
 * entry kept for another retry; the client then builds the depth again
 * (`beginFloor`). Without an entry, the profile as it is.
 */
export function retryTutorialDepth(_registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const entry = profile.dive?.tutorialEntry;
  return entry ? { ...entry, dive: { ...entry.dive, tutorialEntry: entry } } : profile;
}

/**
 * The hand-built floor `beginFloor` builds for the profile's current step (a
 * floor step: its floor), and the state the world starts from; undefined (a
 * generated floor) on any other step or with no tutorial running.
 */
export function tutorialFloorOf(
  registry: DataRegistry,
  profile: DelveProfile,
): FloorOptions['tutorial'] {
  const state = profile.tutorial;
  const step = tutorialStep(registry, state);
  return state && step?.where === 'floor' && step.floor ? { floor: step.floor, state } : undefined;
}

/**
 * Why the Anvil's Delve waits (`LESSON_UNFINISHED`), or null: an Anvil or
 * Training step is current, but for one waiting for the dive itself
 * (`reachDepth`).
 */
export function tutorialBlocksDive(registry: DataRegistry, profile: DelveProfile): string | null {
  const step = tutorialStep(registry, profile.tutorial);
  const lesson = step?.where === 'anvil' || step?.where === 'training';
  return lesson && step.trigger.type !== 'reachDepth' ? LESSON_UNFINISHED : null;
}

/**
 * Step `step`'s line and objective, its tokens filled for the profile's pair
 * and the hero's Primary (`world`: a floor's hero, for the Primary's next move).
 */
export function tutorialText(
  registry: DataRegistry,
  profile: DelveProfile,
  step: string,
  world?: ArpgWorld | null,
): TutorialText {
  const data = registry.getTutorialData();
  const def = data.steps.find((s) => s.id === step);
  if (!def) throw new Error(`No tutorial step ${step}`);
  const mana = registry.getArpgData().mana;
  const { primary } = profile.pair;
  const partner = primary ? data.partners[primary] : null;
  // Before the bind, the secondary is the partner Hesta suggests.
  const secondary = profile.pair.secondary ?? partner;
  const name = (m: ManaType | null) => (m ? mana[m].name : '');
  const tokens: Record<string, string> = {
    primary: name(primary),
    secondary: name(secondary),
    partner: name(partner),
    reaction: primary && secondary ? registry.getReactionFor(primary, secondary).name : '',
    primarySkill: primarySkill(registry, profile, world),
  };
  const fill = (text: string): TutorialTextPart[] => {
    const parts: TutorialTextPart[] = [];
    // Odd pieces are the tokens between braces.
    text.split(/{([^}]*)}/).forEach((piece, i) => {
      const input = i % 2 ? /^input:(.+)$/.exec(piece) : null;
      if (input) {
        parts.push({ input: input[1] as TutorialInput });
        return;
      }
      const run = i % 2 ? (tokens[piece] ?? '') : piece;
      const last = parts[parts.length - 1];
      if (last && 'text' in last) last.text += run;
      else if (run) parts.push({ text: run });
    });
    return parts;
  };
  return { line: fill(def.line), objective: fill(def.objective) };
}

/**
 * The name of the move the hero's Primary casts next: on a floor its hero's
 * (`nextMove`), else the equipped weapon's first Primary move, named as the
 * sim names it ("Fire Bolt", a fusion's "Wildfire Burst"); empty without one.
 */
function primarySkill(
  registry: DataRegistry,
  profile: DelveProfile,
  world?: ArpgWorld | null,
): string {
  const window = registry.getDelveBalance().abilities.comboWindow;
  if (world) return nextMove(world.hero, 0, world.t, window)?.name ?? '';
  const move = primaryMoves(registry, profile)[0];
  if (!move) return '';
  const [a, b] = move.elements;
  const fusion = b ? registry.getFusion(a, b) : undefined;
  const element = fusion ? fusion.name : registry.getArpgData().mana[a].name;
  return `${element} ${registry.getForm(move.form).name}`;
}
