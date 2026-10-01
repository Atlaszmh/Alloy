import type { DataRegistry } from '../data/registry.js';
import type { Chains, ChainSkill } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { ChainOrigins, RuneRef, UnsocketMode } from '../types/rune.js';
import type { ProfileActionResult } from './profile.js';

/**
 * The runes' profile ops (see the runes spec): the pull rule, a draft's rune
 * diff and price, opening a socket, socketing a rune, and fusing. Results,
 * not throws; each refuses mid-dive. Wave 1B builds them.
 */

const NOT_BUILT = 'not built yet';

/** `setChains`' options: where each new move came from, and the pull rule. */
export interface SetChainsOptions {
  origins?: ChainOrigins;
  unsocket?: UnsocketMode;
}

/** What an Apply's runes cost and move (`runeChange`). */
export interface RuneChange {
  /** Sockets opened. */
  links: number;
  /** Sockets opened, and pulls in 'pay'. */
  scrap: number;
  /** Sockets of removed moves (netted against `links`). */
  refundLinks: number;
  /** Out of the pouch. */
  socketed: RuneRef[];
  /** Destroyed ('destroy') or back to the pouch ('pay'). */
  pulled: RuneRef[];
}

/** The builder's one total for a draft: Dust, net Links, scrap, and the runes it destroys or returns. */
export interface DraftPrice {
  dust: number;
  links: number;
  scrap: number;
  refundLinks: number;
  destroys: RuneRef[];
  returns: RuneRef[];
}

/** The pull rule: the override (the dev toggle), else the balance's. */
export function unsocketMode(
  _registry: DataRegistry,
  _override?: UnsocketMode | null,
): UnsocketMode {
  throw new Error(NOT_BUILT);
}

/** The runes' part of an Apply of `chains`: sockets opened, runes socketed and pulled, and their price. */
export function runeChange(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _chains: Partial<Chains>,
  _opts?: SetChainsOptions,
): RuneChange | { refused: string } {
  throw new Error(NOT_BUILT);
}

/** A draft's whole price, from the functions `setChains` charges with. */
export function draftPrice(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _chains: Partial<Chains>,
  _opts?: SetChainsOptions,
): DraftPrice | { refused: string } {
  throw new Error(NOT_BUILT);
}

/** Open the next socket of move `index` of the equipped weapon's `skill` chain, for Links and scrap. */
export function openSocket(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _skill: ChainSkill,
  _index: number,
): ProfileActionResult {
  throw new Error(NOT_BUILT);
}

/** Socket a pouch rune into socket `socket` of move `index` of `skill` (one `setChains`). */
export function socketRune(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _skill: ChainSkill,
  _index: number,
  _socket: number,
  _rune: RuneRef,
  _opts?: SetChainsOptions,
): ProfileActionResult {
  throw new Error(NOT_BUILT);
}

/** Scrap to fuse `fuseCount` of `ref` into one of the next tier; null at tier V. */
export function fusePrice(_registry: DataRegistry, _ref: RuneRef): number | null {
  throw new Error(NOT_BUILT);
}

/** Fuse `fuseCount` of `ref` into one of the next tier, for scrap. */
export function fuseRunes(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _ref: RuneRef,
): ProfileActionResult {
  throw new Error(NOT_BUILT);
}
