import type { ManaType, Rarity, ReactionId } from '@alloy/engine';

/** Pixi (numeric) colors for the arena. CSS colors live in ../format.ts. */
export const MANA_HEX: Record<ManaType, number> = {
  fire: 0xff6a2b,
  frost: 0x6cd4ff,
  storm: 0xf5e049,
  earth: 0xd4a35a,
  shadow: 0xb07cff,
};

export const RARITY_HEX: Record<Rarity, number> = {
  common: 0xb9b9c4,
  uncommon: 0x4ade80,
  magic: 0x60a5fa,
  rare: 0xfcd34d,
  epic: 0xc084fc,
  legendary: 0xfb923c,
};

export const REACTION_HEX: Record<ReactionId, number> = {
  melt: 0xff8a3d,
  shatter: 0xd6f3ff,
  overload: 0xffe14d,
  superconduct: 0x7fd6ff,
  soulfire: 0xd08bff,
};

export const NEUTRAL_HEX = 0xe7e5e4;

export function cssToHex(css: string): number {
  return parseInt(css.replace('#', ''), 16);
}
