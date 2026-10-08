import type { DataRegistry } from '../data/registry.js';
import { constructSkill, formAllowed, isPlain, movesetOf } from '../loot/moveset.js';
import { CHAIN_SKILLS, type Chains, type Construct } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { RuneRef } from '../types/rune.js';
import { classRefusal, movesOf, setChains } from './moveset.js';
import type { ProfileActionResult } from './profile.js';
import type { SetChainsOptions } from './runes.js';

/**
 * The construct operations (the constructs spec §3.3): the Skills tab's draft
 * of the chains and the bag together, and the Loadout's Move all and a bag
 * construct's salvage. Phase A lays the signatures and `draftRefusal`; B2
 * fills the ops, each refusing "Not yet" until then.
 */

/** The Skills tab's draft: the chains as edited and the bag as the draft sees it. A skill `chains` leaves out is unchanged. */
export interface ConstructDraft {
  chains: Partial<Chains>;
  bag: Construct[];
}

const NOT_YET = 'Not yet';

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/**
 * Why `draft` can't be applied, or null (the dry run the client's Apply reads):
 * a uid in both the chains and the bag; a saved uid (the worn weapon's chains'
 * or the bag's) the draft lacks, unless it is plain (deleted at Apply); a bag
 * construct placed into a chain of the wrong skill, or whose form the weapon's
 * class can't express; and whatever `setChains` refuses (past the slots, an
 * empty Basic, the runes, the price). A skill `draft.chains` leaves out reads
 * as unchanged.
 */
export function draftRefusal(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ConstructDraft,
): string | null {
  const weapon = profile.equipped.weapon;
  if (!weapon) return 'Equip a weapon to build your moves';
  const saved = movesetOf(registry, weapon).chains;
  const inChains = new Map<string, Construct>();
  for (const skill of CHAIN_SKILLS)
    for (const m of movesOf(draft.chains[skill] ?? saved[skill]))
      if (m.uid) {
        if (inChains.has(m.uid)) return `${m.uid} is in two slots`;
        inChains.set(m.uid, m);
      }
  const inBag = new Set<string>();
  for (const c of draft.bag) {
    if (!c.uid) return 'A bag construct has no uid';
    if (inChains.has(c.uid) || inBag.has(c.uid)) return `${c.uid} is in two places`;
    inBag.add(c.uid);
  }
  // Every saved construct is still somewhere, or was plain.
  const before = [
    ...CHAIN_SKILLS.flatMap((skill) => movesOf(saved[skill])),
    ...profile.constructs,
  ];
  for (const c of before)
    if (c.uid && !inChains.has(c.uid) && !inBag.has(c.uid) && !isPlain(c))
      return `${c.uid} would be lost`;
  // A placed bag construct: its skill, and its class.
  const bagBefore = new Map(profile.constructs.map((c) => [c.uid!, c]));
  for (const skill of CHAIN_SKILLS)
    for (const m of movesOf(draft.chains[skill] ?? saved[skill])) {
      if (!m.uid || !bagBefore.has(m.uid)) continue;
      if (constructSkill(registry, m) !== skill) return `${m.uid} is not a ${skill} construct`;
      if ('form' in m && !formAllowed(registry, weapon.baseId, m.form))
        return classRefusal(registry, weapon, m.form);
    }
  const dry = setChains(registry, profile, draft.chains);
  return dry.ok ? null : (dry.reason ?? 'Refused');
}

/** `setChains` grown: the chains and the bag together, all or nothing (B2 fills it). */
export function applyDraft(
  _registry: DataRegistry,
  profile: DelveProfile,
  _draft: ConstructDraft,
  _opts: SetChainsOptions = {},
): ProfileActionResult {
  return refuse(profile, NOT_YET);
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
