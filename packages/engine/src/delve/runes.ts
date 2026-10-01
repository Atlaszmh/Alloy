import type { DataRegistry } from '../data/registry.js';
import { addToPouch } from '../loot/runes.js';
import type { Chains, ChainSkill } from '../types/ability.js';
import type { DelveProfile } from '../types/delve.js';
import type { ChainOrigins, RunePouch, RuneRef, UnsocketMode } from '../types/rune.js';
import type { ProfileActionResult } from './profile.js';

/**
 * Runes on the hero's moves (see the runes spec): the pull rule, the parts
 * rule, the draft's rune price, opening sockets, socketing, and fusing.
 * moveset.ts, profile.ts and pair.ts import this module back: keep to
 * function declarations.
 */

export interface SetChainsOptions {
  origins?: ChainOrigins;
  unsocket?: UnsocketMode;
}

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

export interface DraftPrice {
  dust: number;
  links: number;
  scrap: number;
  refundLinks: number;
  destroys: RuneRef[];
  returns: RuneRef[];
}

/** What a pull does: `override` (the client's dev toggle) or the balance's `runes.unsocket`. */
export function unsocketMode(registry: DataRegistry, override?: UnsocketMode | null): UnsocketMode {
  return override ?? registry.getDelveBalance().runes.unsocket;
}

/**
 * The parts rule for `runes` leaving a weapon other than through Apply (a
 * salvage, a fuse, a transfer, the choice of mana): in 'pay' they go back to
 * `pouch` free, in 'destroy' they are destroyed. The sockets' Links are the
 * caller's (one each, in both modes).
 */
export function settleParts(
  registry: DataRegistry,
  pouch: RunePouch,
  runes: readonly RuneRef[],
  unsocket?: UnsocketMode | null,
): { pouch: RunePouch; runes: RuneRef[]; destroyed: RuneRef[] } {
  const list = runes.map((r) => ({ ...r }));
  if (unsocketMode(registry, unsocket) === 'pay')
    return { pouch: addToPouch(pouch, list), runes: list, destroyed: [] };
  return { pouch, runes: [], destroyed: list };
}

export function runeChange(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _chains: Partial<Chains>,
  _opts?: SetChainsOptions,
): RuneChange | { refused: string } {
  throw new Error('not built yet');
}

export function draftPrice(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _chains: Partial<Chains>,
  _opts?: SetChainsOptions,
): DraftPrice | { refused: string } {
  throw new Error('not built yet');
}

export function openSocket(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _skill: ChainSkill,
  _index: number,
): ProfileActionResult {
  throw new Error('not built yet');
}

export function socketRune(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _skill: ChainSkill,
  _index: number,
  _socket: number,
  _rune: RuneRef,
  _opts?: SetChainsOptions,
): ProfileActionResult {
  throw new Error('not built yet');
}

export function fusePrice(_registry: DataRegistry, _ref: RuneRef): number | null {
  throw new Error('not built yet');
}

export function fuseRunes(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _ref: RuneRef,
): ProfileActionResult {
  throw new Error('not built yet');
}
