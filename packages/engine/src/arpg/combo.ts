import type { HeroEntity } from '../types/arpg.js';
import type { DelveBalance } from '../types/delve.js';
import { basicStep } from './basic.js';
import { pressStep } from './abilities/cast.js';

/**
 * Each chain (the basic attack's and each skill's) keeps its own place: a move
 * of one never resets another, and while the hero performs a move (a swing, a
 * wind-up, a hold) every other chain's restart window waits, so chains can be
 * mixed (two basics, a Primary, and the basic goes on at its third blow).
 */
export function comboPauseTick(h: HeroEntity, dt: number): void {
  const acting = h.windup?.slot ?? h.hold?.slot ?? (h.swing ? 'basic' : null);
  if (acting === null) return;
  h.chains.forEach((chain, slot) => {
    if (chain && slot !== acting) h.comboAt[slot] += dt;
  });
  if (acting !== 'basic') h.lastBasicAt += dt;
}

/** One chain's place, for the combo rings: its moves, the next one, and its restart window left. */
export interface ChainProgress {
  /** 'basic', or the skill's slot (0 Primary, 1 Defensive, 2 Ultimate). */
  slot: 'basic' | number;
  length: number;
  /** The move the next press (or swing) makes. */
  next: number;
  /** The share (1..0) of its restart window left; 0 once it has started over. */
  left: number;
}

/** Every chain the hero carries, the basic attack's first. */
export function chainProgress(h: HeroEntity, t: number, bal: DelveBalance): ChainProgress[] {
  const out: ChainProgress[] = [];
  const blows = h.stats.weapon.blows.length;
  const basicWindow = h.stats.attackInterval + bal.hero.basicComboGrace;
  const sinceBasic = t - h.lastBasicAt;
  out.push({
    slot: 'basic',
    length: blows,
    next: basicStep(h, t, bal),
    left: sinceBasic > basicWindow ? 0 : Math.min(1, 1 - sinceBasic / basicWindow),
  });
  const window = bal.abilities.comboWindow;
  h.chains.forEach((chain, slot) => {
    if (!chain) return;
    const since = t - h.comboAt[slot];
    out.push({
      slot,
      length: chain.moves.length,
      next: pressStep(h, slot, t, window),
      left: since > window ? 0 : Math.min(1, 1 - since / window),
    });
  });
  return out;
}
