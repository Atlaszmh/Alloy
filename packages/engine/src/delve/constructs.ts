import type { DataRegistry } from '../data/registry.js';
import { constructSkill, formAllowed, isPlain, moveAllPreview, movesetOf } from '../loot/moveset.js';
import {
  CHAIN_SKILLS,
  type Blow,
  type Chains,
  type ChainSkill,
  type Construct,
  type Move,
} from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { RuneRef } from '../types/rune.js';
import { isDiveActive } from './dive.js';
import { classRefusal, movesOf, setChains } from './moveset.js';
import { mintMoveset, withMoveset, type ProfileActionResult } from './profile.js';
import { settleParts, unsocketMode, type SetChainsOptions } from './runes.js';
import { applyTutorialEvents } from './tutorial.js';
import { socketsOf } from '../loot/runes.js';

/**
 * The construct operations (the constructs spec §3.3): the Skills tab's draft
 * of the chains and the bag together, and the Loadout's Move all and a bag
 * construct's salvage. Phase A laid the signatures; B2 fills the ops, each
 * refusing "Not yet" until its task lands.
 */

/** The Skills tab's draft: the chains as edited and the bag as the draft sees it. A skill `chains` leaves out is unchanged. */
export interface ConstructDraft {
  chains: Partial<Chains>;
  bag: Construct[];
}

const BETWEEN_DIVES = 'Chains can only change between dives';
const UNARMED_TEXT = 'Equip a weapon to build your moves';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** A moveset's constructs minted in chain order (Move all's refill, `chooseStartingMana`): Phase A's helper. */
export { mintMoveset };

/**
 * `constructs` into the bag, the one door into `profile.constructs` (the spec's
 * auto-salvage of plain constructs, §3.3): a plain one (no socket, no rune) is
 * dropped when `autoSalvagePlain`. Nothing is copied: no op changes a construct in place.
 */
export function intoBag(profile: DelveProfile, constructs: readonly Construct[]): DelveProfile {
  const kept = profile.autoSalvagePlain ? constructs.filter((c) => !isPlain(c)) : constructs;
  if (kept.length === 0) return profile;
  return { ...profile, constructs: [...profile.constructs, ...kept] };
}

/** Where a saved construct sits: its chain's skill, or null in the bag. */
type Place = ChainSkill | null;

/**
 * The free part of a draft (the spec's §3.3: placing, unsocketing and
 * reordering cost nothing): every uid the draft's chains and bag hold is a
 * saved construct (in a chain or the bag) in one place; a construct placed
 * from the bag is of its chain's skill and of a form the weapon's class
 * expresses (a kept one may stay dormant); a saved construct the draft drops
 * is plain. A chain the draft leaves out is unchanged (so a bag entry still
 * sitting in it is a uid in two places). Gives the profile with the worn
 * weapon's chains and the bag rearranged, each construct its *saved* self in
 * its *draft* place (a new one, without a uid, left out), so `setChains` then
 * prices only what changed on each; a plain construct the draft displaced
 * into the bag is dropped under `autoSalvagePlain`. Or the refusal.
 */
function rearrange(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ConstructDraft,
): DelveProfile | string {
  if (isDiveActive(profile)) return BETWEEN_DIVES;
  const weapon = profile.equipped.weapon;
  if (!weapon) return UNARMED_TEXT;
  const moveset = movesetOf(registry, weapon);
  const saved = new Map<string, { c: Construct; at: Place }>();
  for (const skill of CHAIN_SKILLS)
    for (const c of movesOf(moveset.chains[skill])) saved.set(c.uid!, { c, at: skill });
  for (const c of profile.constructs) saved.set(c.uid!, { c, at: null });
  const seen = new Set<string>();
  const take = (uid: string): { c: Construct; at: Place } | string => {
    const was = saved.get(uid);
    if (!was) return `Unknown construct ${uid}`;
    if (seen.has(uid)) return 'A construct is in one place';
    seen.add(uid);
    return was;
  };
  const chains = { ...moveset.chains };
  for (const skill of CHAIN_SKILLS) {
    const held = moveset.chains[skill];
    if (!held) continue; // no slots: a draft chain there is setChains' refusal
    const moves: Construct[] = [];
    for (const m of movesOf(draft.chains[skill] ?? held)) {
      if (!m.uid) continue; // new: setChains mints and prices it
      const was = take(m.uid);
      if (typeof was === 'string') return was;
      if (constructSkill(registry, was.c) !== skill) return `Not a ${skill} construct`;
      if (was.at === null && 'form' in was.c && !formAllowed(registry, weapon.baseId, was.c.form))
        return classRefusal(registry, weapon, was.c.form);
      moves.push(was.c);
    }
    (chains as Record<ChainSkill, unknown>)[skill] = Array.isArray(held) ? moves : { ...held, moves };
  }
  const bag: Construct[] = [];
  for (const c of draft.bag) {
    if (!c.uid) return 'Nothing new is made in the bag';
    const was = take(c.uid);
    if (typeof was === 'string') return was;
    // Displaced into the bag: a plain one is deleted at Apply (the spec's auto-salvage).
    if (was.at !== null && profile.autoSalvagePlain && isPlain(was.c)) continue;
    bag.push(was.c);
  }
  for (const [uid, was] of saved)
    if (!seen.has(uid) && !isPlain(was.c)) return 'Every construct is kept: unsocket it to the bag';
  return { ...withMoveset(profile, { ...moveset, chains }), constructs: bag };
}

/** Why `draft` can't be applied (`applyDraft`'s dry run, the client's Apply reads it), or null. */
export function draftRefusal(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ConstructDraft,
  opts: SetChainsOptions = {},
): string | null {
  const free = rearrange(registry, profile, draft);
  if (typeof free === 'string') return free;
  const res = setChains(registry, free, draft.chains, opts);
  return res.ok ? null : (res.reason ?? 'Refused');
}

/**
 * Apply the Skills tab's draft, all or nothing (the constructs spec §3.3):
 * the free rearrangement (`rearrange`) of the worn weapon's chains and the
 * bag, then `setChains` on it with the draft's chains, which prices by uid
 * what changed on each construct (a kind or form `editDust`, an element set
 * `elementDust`, sockets and runes, a payment, a new construct `editDust`,
 * minted) and emits its events. Refuses what either refuses; the profile's
 * `constructs` becomes the draft's bag.
 */
export function applyDraft(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ConstructDraft,
  opts: SetChainsOptions = {},
): ProfileActionResult {
  const free = rearrange(registry, profile, draft);
  if (typeof free === 'string') return refuse(profile, free);
  const res = setChains(registry, free, draft.chains, opts);
  return res.ok ? res : { ...res, profile };
}

/** `chain` with its constructs replaced by `moves` (a chain of blows stays one). */
function withMoves(chain: Chains[ChainSkill], moves: Construct[]): Chains[ChainSkill] {
  return Array.isArray(chain) ? (moves as Blow[]) : { ...chain, moves: moves as Move[] };
}

/**
 * Place bag construct `uid` into slot `index` of the worn weapon's `skill`
 * chain: at the chain's end into a free slot, else over the construct there,
 * which goes to the bag (a plain one deleted under `autoSalvagePlain`). Free
 * (a one-op `applyDraft`, which refuses the wrong skill, a form the weapon's
 * class can't express, mid-dive and unarmed; the pair is never checked, see
 * the spec's §3.4).
 */
export function placeConstruct(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  skill: ChainSkill,
  index: number,
): ProfileActionResult {
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const c = profile.constructs.find((x) => x.uid === uid);
  if (!c) return refuse(profile, 'Not in your bag');
  const moveset = movesetOf(registry, weapon);
  const chain = moveset.chains[skill];
  if (!chain) return refuse(profile, `This weapon has no ${skill} slots`);
  const moves = movesOf(chain);
  if (!Number.isInteger(index) || index < 0 || index > moves.length || index >= moveset.slots[skill]!)
    return refuse(profile, 'No slot there');
  const next = [...moves];
  const out = next.splice(index, 1, c); // at the end: appended, nothing out
  return applyDraft(registry, profile, {
    chains: { [skill]: withMoves(chain, next) },
    bag: [...profile.constructs.filter((x) => x.uid !== uid), ...out],
  });
}

/**
 * Unsocket the construct at `index` of the worn weapon's `skill` chain into
 * the bag; the chain closes up. Free (a one-op `applyDraft`). The Basic keeps
 * at least one blow.
 */
export function unsocketConstruct(
  registry: DataRegistry,
  profile: DelveProfile,
  skill: ChainSkill,
  index: number,
): ProfileActionResult {
  const weapon = profile.equipped.weapon;
  if (!weapon) return refuse(profile, UNARMED_TEXT);
  const chain = movesetOf(registry, weapon).chains[skill];
  const moves = movesOf(chain);
  const c = Number.isInteger(index) ? moves[index] : undefined;
  if (!chain || !c) return refuse(profile, 'Pick a move the chain holds');
  if (skill === 'basic' && moves.length === 1) return refuse(profile, 'The Basic keeps at least one blow');
  return applyDraft(registry, profile, {
    chains: { [skill]: withMoves(chain, moves.filter((_, i) => i !== index)) },
    bag: [...profile.constructs, c],
  });
}

/**
 * Move all (the constructs spec §3.3): every construct on the worn weapon
 * goes onto bag weapon `uid` slot for slot, each chain's payment with it
 * (`moveAllPreview`); those past the target's slots and the target's own go
 * to the bag (`intoBag`); those the target's class can't express stay,
 * dormant. A target skill the worn weapon moves nothing into keeps its own.
 * The old weapon goes to the bag refilled plain, its uids minted here
 * (`mintMoveset`). No scrap; commits at once, then emits the tutorial's
 * `moveAll`. Refuses mid-dive, unarmed and anything but a bag weapon.
 */
export function moveAll(registry: DataRegistry, profile: DelveProfile, uid: string): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Move your constructs between dives');
  const worn = profile.equipped.weapon;
  if (!worn) return refuse(profile, UNARMED_TEXT);
  const target = profile.bag.find((i) => i.uid === uid && i.slot === 'weapon');
  if (!target) return refuse(profile, 'Move onto a weapon in your bag');
  const { moveset, toBag, old } = moveAllPreview(registry, worn, target);
  const [refill, minted] = mintMoveset(profile, old);
  const item = { ...target, moveset };
  const moved: DelveProfile = {
    ...minted,
    equipped: { ...profile.equipped, weapon: item },
    bag: [...profile.bag.filter((i) => i.uid !== uid), { ...worn, moveset: refill }],
  };
  return {
    ok: true,
    item,
    profile: applyTutorialEvents(registry, intoBag(moved, toBag), [{ type: 'moveAll' }]),
  };
}

/**
 * Salvage bag construct `uid` (the constructs spec §3.3): its runes back to
 * the pouch at the pull price (`pullScrap` by tier in 'pay', `opts.unsocket`
 * else the balance's; destroyed for nothing in 'destroy') and
 * `movesets.salvageDust` Mana Dust; its sockets and the Dust spent on it are
 * not refunded. Refuses mid-dive, a uid not in the bag, and short of the
 * scrap. Commits at once (the client's Undo keeps the save from before).
 */
export function salvageConstruct(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  opts: Pick<SetChainsOptions, 'unsocket'> = {},
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Salvage between dives');
  const c = profile.constructs.find((x) => x.uid === uid);
  if (!c) return refuse(profile, 'Not in your bag');
  const bal = registry.getDelveBalance();
  const runes = socketsOf(c).filter((r): r is RuneRef => r !== null);
  const pay = unsocketMode(registry, opts.unsocket) === 'pay';
  const scrap = pay ? runes.reduce((sum, r) => sum + bal.runes.pullScrap[r.tier - 1], 0) : 0;
  if (profile.scrap < scrap) return refuse(profile, 'Not enough scrap to pull its runes');
  const settled = settleParts(registry, profile.runes, runes, opts.unsocket);
  return {
    ok: true,
    runes: settled.runes,
    destroyed: settled.destroyed,
    profile: {
      ...profile,
      constructs: profile.constructs.filter((x) => x.uid !== uid),
      scrap: profile.scrap - scrap,
      manaDust: profile.manaDust + bal.movesets.salvageDust,
      runes: settled.pouch,
    },
  };
}
