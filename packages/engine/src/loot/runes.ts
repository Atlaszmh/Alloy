import type { DataRegistry } from '../data/registry.js';
import type { Blow, FormId, KnobsData, Move } from '../types/ability.js';
import type { Rarity } from '../types/gear.js';
import {
  MAX_SOCKETS,
  RUNE_TIERS,
  type RuneDef,
  type RunePouch,
  type RuneRef,
  type RuneTarget,
} from '../types/rune.js';

/**
 * Runes' pure parts (see the runes spec): what a rune fits and acts on, its
 * knobs and its words, a move's sockets and their price, and the pouch. It
 * imports nothing from `delve/`. The rolls and a weapon's parts live beside
 * what they act on and are re-exported at the end: `runeTierAt` and
 * `rollRuneDrop` in `loot/drops.ts`, `rollSockets` and `weaponParts` in
 * `loot/moveset.ts`.
 */

/** Whether `def` fits `on`: a form it lists, or a blow of a weapon it lists (unarmed fits none). */
export function runeFits(def: RuneDef, on: RuneTarget): boolean {
  if ('form' in on) return def.fits.forms.includes(on.form);
  return on.weapon !== null && def.fits.weapons.includes(on.weapon);
}

/**
 * Whether `def` acts on `on`: it fits, a blow's kind is one its `fits.kinds`
 * lists, and a rune that sets `pierce` isn't on a row that bursts. One that
 * fits but doesn't act stays socketed, dormant.
 */
export function runeActive(def: RuneDef, on: RuneTarget): boolean {
  if (!runeFits(def, on)) return false;
  if ('form' in on) return true;
  if (def.fits.kinds && !def.fits.kinds.includes(on.kind)) return false;
  return !(on.explode && def.tiers.some((t) => t.pierce !== undefined));
}

/**
 * The knob sets of a move's or a blow's sockets acting on `on`, in socket
 * order, and the runes they come from. Empty sockets, unknown ids and
 * dormant runes are skipped.
 */
export function runeKnobs(
  registry: DataRegistry,
  runes: readonly (RuneRef | null)[] | undefined,
  on: RuneTarget,
): { knobs: KnobsData[]; active: RuneRef[] } {
  const knobs: KnobsData[] = [];
  const active: RuneRef[] = [];
  for (const ref of runes ?? []) {
    const def = ref ? registry.findRune(ref.id) : undefined;
    if (!ref || !def || !runeActive(def, on)) continue;
    knobs.push(def.tiers[ref.tier - 1]);
    active.push(ref);
  }
  return { knobs, active };
}

/**
 * Each shot's power under an `extraShots` of `power` on `form`: the cut in
 * full, half of it on a Volley, none on a Barrage. The resolver and
 * `runeText` both read it.
 */
export function extraShotPower(power: number, form: FormId | null): number {
  if (form === 'volley') return 1 - (1 - power) / 2;
  return form === 'barrage' ? 1 : power;
}

/** A number as rune texts print it: float noise rounded off, at most three decimals. */
function num(x: number): string {
  return String(Math.round(x * 1000) / 1000);
}

const TEMPLATE = /\{([\w.]+)(?::(%|±%))?\}/g;

/**
 * Fill a rune template from a tier's knobs (`{runes.key}` from the balance),
 * and whether it reads as any change: a percentage at 100% (or ±0%) doesn't.
 */
function fill(
  registry: DataRegistry,
  template: string,
  knobs: KnobsData,
): { text: string; change: boolean } {
  let change = false;
  const text = template.replace(TEMPLATE, (_, path: string, fmt: string | undefined) => {
    const keys = path.split('.');
    const root: unknown = keys[0] === 'runes' ? registry.getDelveBalance().runes : knobs;
    const value = (keys[0] === 'runes' ? keys.slice(1) : keys).reduce<unknown>(
      (v, key) => (v as Record<string, unknown> | undefined)?.[key],
      root,
    );
    if (typeof value !== 'number') throw new Error(`No number at {${path}}`);
    if (!fmt || value !== 1) change = true;
    if (fmt === '%') return `${num(value * 100)}%`;
    if (fmt === '±%') return `${value < 1 ? '−' : '+'}${num(Math.abs(value - 1) * 100)}%`;
    return num(value);
  });
  return { text, change };
}

/**
 * A rune's effect and trade-off at its tier, as the player reads them. With
 * `on`, the numbers are the move's (Multi-shot's cut halved on a Volley, gone
 * on a Barrage), and a trade-off that comes to no change is null.
 */
export function runeText(
  registry: DataRegistry,
  ref: RuneRef,
  on?: RuneTarget,
): { effect: string; tradeoff: string | null } {
  const def = registry.getRune(ref.id);
  let knobs = def.tiers[ref.tier - 1];
  if (knobs.extraShots && on && 'form' in on)
    knobs = {
      ...knobs,
      extraShots: {
        ...knobs.extraShots,
        power: extraShotPower(knobs.extraShots.power, on.form),
      },
    };
  const tradeoff = def.tradeoff === null ? null : fill(registry, def.tradeoff, knobs);
  return {
    effect: fill(registry, def.effect, knobs).text,
    tradeoff: tradeoff?.change ? tradeoff.text : null,
  };
}

/** Most sockets a move may open on a weapon of `rarity` (unarmed, null: 0). */
export function socketCap(registry: DataRegistry, rarity: Rarity | null): number {
  return rarity ? registry.getDelveBalance().runes.socketCap[rarity] : 0;
}

/** The price of a move's next socket when it has `open`; null at `MAX_SOCKETS`. */
export function socketPrice(
  registry: DataRegistry,
  open: number,
): { links: number; scrap: number } | null {
  if (open >= MAX_SOCKETS) return null;
  const r = registry.getDelveBalance().runes;
  return { links: r.socketLinks[open], scrap: r.socketScrap[open] };
}

/** How many of `ref` (its id at its tier) the pouch holds. */
export function pouchCount(pouch: RunePouch, ref: RuneRef): number {
  return pouch[ref.id]?.[ref.tier - 1] ?? 0;
}

/** The pouch with one more of each of `refs`. */
export function addToPouch(pouch: RunePouch, refs: readonly RuneRef[]): RunePouch {
  const next = { ...pouch };
  for (const { id, tier } of refs) {
    const counts = [...(next[id] ?? Array<number>(RUNE_TIERS).fill(0))];
    counts[tier - 1]++;
    next[id] = counts;
  }
  return next;
}

/** The pouch with one fewer of each of `refs`, or null when it is short of any. */
export function takeFromPouch(pouch: RunePouch, refs: readonly RuneRef[]): RunePouch | null {
  const next = { ...pouch };
  for (const { id, tier } of refs) {
    const counts = [...(next[id] ?? Array<number>(RUNE_TIERS).fill(0))];
    if (counts[tier - 1] <= 0) return null;
    counts[tier - 1]--;
    next[id] = counts;
  }
  return next;
}

/** A move's or a blow's sockets (none when it has no `runes`). */
export function socketsOf(m: Move | Blow): (RuneRef | null)[] {
  return m.runes ?? [];
}

export { rollRuneDrop, runeTierAt } from './drops.js';
export { rollSockets, weaponParts } from './moveset.js';
