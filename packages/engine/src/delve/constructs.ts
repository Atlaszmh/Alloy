import type { DataRegistry } from '../data/registry.js';
import { constructSkill, formAllowed, isPlain, movesetOf } from '../loot/moveset.js';
import { CHAIN_SKILLS, type Chains, type ChainSkill, type Construct } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { RuneRef } from '../types/rune.js';
import { isDiveActive } from './dive.js';
import { classRefusal, movesOf, setChains } from './moveset.js';
import { withMoveset, type ProfileActionResult } from './profile.js';
import type { SetChainsOptions } from './runes.js';

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

const NOT_YET = 'Not yet';
const BETWEEN_DIVES = 'Chains can only change between dives';
const UNARMED_TEXT = 'Equip a weapon to build your moves';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** A moveset's constructs minted in chain order (Move all's refill, `chooseStartingMana`): Phase A's helper. */
export { mintMoveset } from './profile.js';

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

/** A bag construct into slot `index` of `skill` (a one-op `applyDraft`; B2 fills it). */
export function placeConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _uid: string,
  _skill: Chains extends infer _C ? keyof Chains : never,
  _index: number,
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

/** Slot `index` of `skill` to the bag, its chain closing up (a one-op `applyDraft`; B2 fills it). */
export function unsocketConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _skill: keyof Chains,
  _index: number,
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

/** Move all (the constructs spec §3.3): the worn weapon's constructs onto bag weapon `uid`, equipped (B2 fills it). */
export function moveAll(
  _registry: DataRegistry,
  profile: DelveProfile,
  _uid: string,
): ProfileActionResult {
  return refuse(profile, NOT_YET);
}

/** Salvage bag construct `uid`: its runes to the pouch at the pull price, `salvageDust` Dust (B2 fills it). */
export function salvageConstruct(
  _registry: DataRegistry,
  profile: DelveProfile,
  _uid: string,
  _opts: SetChainsOptions = {},
): ProfileActionResult & { runes?: RuneRef[] } {
  return refuse(profile, NOT_YET);
}
