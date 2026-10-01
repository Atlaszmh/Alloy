import type { ArpgEvent, RuneFamily, RuneRef } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { FAMILY_STYLE } from '../../runes/rune-style';
import { MANA_HEX, cssToHex } from '../palette';
import type { ManaFx } from './mana-fx';

/**
 * Runes in the arena: the flash when a rune's effect fires (a `runeFx` event:
 * Split's shards, an Echo, a reaction Volatile boosted) and the colour a rune
 * wears on the floor. Everything else a rune adds (shots, shards, echoes,
 * zones, Guard's barrier) draws through the existing paths. Cosmetic, so it
 * may use Math.random (ManaFx does).
 */

type RuneFxEvent = Extract<ArpgEvent, { kind: 'runeFx' }>;
export type RuneEffect = RuneFxEvent['effect'];

/** Each effect's glyph: 5×5 cells, '#' lit, each drawn as a 2×2-pixel block. */
export const GLYPHS: Record<RuneEffect, readonly string[]> = {
  // Shards flying apart.
  split: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  // A ring answering a ring.
  echo: ['#..#.', '.#..#', '.#..#', '.#..#', '#..#.'],
  // A spark going off.
  volatile: ['..#..', '.###.', '#####', '.###.', '..#..'],
};

/** The family of each effect's rune. */
const EFFECT_FAMILY: Record<RuneEffect, RuneFamily> = {
  split: 'shape',
  echo: 'tempo',
  volatile: 'elemental',
};

/** How far above its point a glyph flashes (world units), clear of the hit's sparks. */
export const GLYPH_LIFT = 0.9;

/**
 * How far below its point Volatile's glyph flashes: it fires with a reaction, whose label pops
 * over the point's top and would hide it. A glyph rises 0.4 as it fades, so it ends clear of the foe.
 */
export const GLYPH_DROP = 1;

/** A family's colour for Pixi (`FAMILY_STYLE` holds it as CSS). */
export function familyHex(family: RuneFamily): number {
  return cssToHex(FAMILY_STYLE[family].color);
}

/** A rune's colour: its family's (white for an id the data doesn't have). */
export function runeHex(ref: RuneRef): number {
  const def = getDelveRegistry().findRune(ref.id);
  return def ? familyHex(def.family) : 0xffffff;
}

/**
 * A rune's effect fires: its glyph flashes above the point (Volatile's below)
 * in its family's colour, over a small ring in the element's (the family's
 * without one).
 */
export function runeFx(fx: ManaFx, e: RuneFxEvent): void {
  const color = familyHex(EFFECT_FAMILY[e.effect]);
  const y = e.effect === 'volatile' ? e.y + GLYPH_DROP : e.y - GLYPH_LIFT;
  fx.glyph(e.x, y, GLYPHS[e.effect], color);
  fx.ring(e.x, e.y, 0.6, e.element ? MANA_HEX[e.element] : color, false, 0.25);
}
