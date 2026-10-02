import type { ManaType, Rarity, ReactionId } from '@alloy/engine';
import { RARITY_COLOR } from '../format';

/** Pixi (numeric) colors for the arena. CSS colors live in ../format.ts. */
export const MANA_HEX: Record<ManaType, number> = {
  fire: 0xff6a2b,
  frost: 0x6cd4ff,
  storm: 0xf5e049,
  earth: 0xd4a35a,
  shadow: 0xb07cff,
  nature: 0x6fcf57,
};

/** The rarities' colours as numbers: format.ts's RARITY_COLOR, so the drops match the tiles. */
export const RARITY_HEX = Object.fromEntries(
  Object.entries(RARITY_COLOR).map(([r, c]) => [r, parseInt(c.slice(1), 16)]),
) as Record<Rarity, number>;

export const REACTION_HEX: Record<ReactionId, number> = {
  melt: 0xff8a3d,
  shatter: 0xd6f3ff,
  overload: 0xffe14d,
  superconduct: 0x7fd6ff,
  soulfire: 0xd08bff,
  combust: 0x9cf07a,
  blight: 0x8fb34a,
  obsidian: 0xf0a878,
  lightning_rod: 0xfff6a0,
  sunder: 0xc9905a,
  seedling: 0x7ee08a,
  siphon: 0x9fa8ff,
  crystallize: 0xa8fff0,
  blackout: 0x8a7aa8,
  galvanize: 0xd8f56a,
};

export const NEUTRAL_HEX = 0xe7e5e4;

export function cssToHex(css: string): number {
  return parseInt(css.replace('#', ''), 16);
}
