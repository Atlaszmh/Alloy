import type { DataRegistry } from '../data/registry.js';
import { computeHeroStats } from '../delve/hero-stats.js';
import {
  ABILITY_PAYMENTS,
  ABILITY_SLOTS,
  MOVE_KINDS,
  type Chains,
  type MoveKind,
} from '../types/ability.js';
import type { ArpgEvent, ArpgInput } from '../types/arpg.js';
import { MANA_TYPES, type ManaType } from '../types/mana.js';
import { holdCharge, pressMove } from './abilities/cast.js';
import { defaultBasic, defaultChains } from './abilities/resolve.js';
import { dist } from './geometry.js';
import { createSandboxWorld, sandboxWeapon, spawnDummies } from './sandbox.js';
import { stepWorld } from './step.js';

/**
 * The DPS Lab's sim (a dev tool; see the DPS Lab spec): one loadout on the
 * Training Grounds' dummies for DPS_SECONDS, holding one button, with a plain
 * weapon at a depth and nothing else. Pure and deterministic: every run uses
 * the sandbox's world seed.
 */

/** One run: a whole loadout, labelled by the dimensions the lab filters and colours by. */
export interface DpsSetup {
  view: 'basic' | 'ability';
  /**
   * Filterable dimensions in display order, e.g. { weapon, primary, secondary } or
   * { form, first, second, kind, payment } (a kind, or 'default' for the form's default
   * chain). Values are short ids; a missing element is 'none'.
   */
  dims: Record<string, string>;
  weapon: { baseId: string; primary: ManaType; secondary: ManaType | null };
  /** The hero's chains: the basic chain (for the stats) and each ability slot's. */
  chains: Chains;
  /** The button held: the basic attack, or an ability slot. */
  hold: 'attack' | { slot: number };
}

export interface DpsOptions {
  depth: number;
  /** Five dummies in a clump instead of one. */
  pack: boolean;
}

export interface DpsResult {
  /** Average DPS so far (damage ÷ elapsed), every 0.5 s (15 ticks): index i is at (i + 1) × 0.5 s. 60 samples. */
  series: number[];
  /** The last sample: DPS over the whole 30 s. */
  dps: number;
  /**
   * How often the held button acted: `basic` events (strikes) for `hold: 'attack'`, casts of
   * that slot for `hold: { slot }`. 0 means it never could, e.g. an unaffordable ability.
   */
  casts: number;
}

export const DPS_SECONDS = 30;
/** Seconds between the samples of `DpsResult.series`. */
export const DPS_SAMPLE = 0.5;
/** Edge to edge: the hero and the nearest dummy. */
const GAP = 0.4;
const NO_TOGGLES = { infiniteMana: false, noCooldowns: false, invulnerable: false };

/** Average DPS over time for one setup: the held button's own damage (see `DpsSetup.hold`). */
export function simulateDps(registry: DataRegistry, setup: DpsSetup, o: DpsOptions): DpsResult {
  const { baseId, primary, secondary } = setup.weapon;
  const weapon = sandboxWeapon(registry, {
    baseId,
    mana: primary,
    rarity: 'common',
    ilvl: o.depth,
  });
  const world = createSandboxWorld(registry, {
    depth: o.depth,
    stats: computeHeroStats({ weapon }, registry, {
      pair: { primary, secondary },
      basic: setup.chains.basic,
    }),
    chains: setup.chains,
    toggles: NO_TOGGLES,
  });
  const h = world.hero;
  const start = { x: h.x, y: h.y };
  const dummies = spawnDummies(registry, world, {
    layout: o.pack ? 'clump' : 'single',
    element: null,
  });
  // Both layouts stand their nearest dummy straight ahead: slide the group in to GAP.
  const near = dummies.reduce((a, b) =>
    dist(h.x, h.y, a.x, a.y) <= dist(h.x, h.y, b.x, b.y) ? a : b,
  );
  const slide = dist(h.x, h.y, near.x, near.y) - h.radius - near.radius - GAP;
  for (const m of dummies) {
    m.y += slide;
    m.dummy!.homeY = m.y;
  }

  const aim = { x: near.x, y: near.y };
  const hold = setup.hold;
  const slot = hold === 'attack' ? null : hold.slot;
  const bal = registry.getDelveBalance();
  const move = { x: 0, y: 0 };
  // The held button, each tick: the attack; or the ability, as the pad's hold-to-repeat holds
  // it: a repeat press made early (during a wind-up, a beat or a cooldown) waits in the buffer,
  // one refused for mana is dropped and pressed again, and a hold move is held to full charge,
  // then let go.
  const input = (): ArpgInput => {
    if (slot === null) return { move, attack: true, attackAim: aim };
    if (h.hold) {
      const full = holdCharge(bal, h.hold.start, world.t, h.hold.full).charge >= 1;
      return { move, holding: slot, cast: full ? { slot, aim } : null };
    }
    const waiting = world.queuedCasts.some((q) => q.cast.slot === slot);
    if (waiting || pressMove(h, slot, world.t, bal.abilities.comboWindow)?.kind === 'hold')
      return { move, holding: slot };
    return { move, holding: slot, cast: { slot, aim, repeat: true } };
  };
  const acted = (e: ArpgEvent) =>
    slot === null ? e.kind === 'basic' : e.kind === 'cast' && e.slot === slot;

  const step = bal.arena.step;
  const ticks = Math.round(DPS_SAMPLE / step);
  const series: number[] = [];
  let damage = 0;
  let casts = 0;
  for (let i = 0; i < DPS_SECONDS / DPS_SAMPLE; i++) {
    for (let k = 0; k < ticks; k++) {
      for (const e of stepWorld(registry, world, input(), step)) {
        if (e.kind === 'hit' && (slot === null || e.slot === slot)) damage += e.amount;
        if (acted(e)) casts++;
      }
      // Positions are held: knockback, pulls and pushes never drift anyone out of reach. The hero
      // goes back to its start plus what its running pushes have moved it, so a lunge still plays
      // out (stopping at contact) and the hero is back at its start once they end.
      h.x = start.x + h.pushes.reduce((a, p) => a + p.movedX, 0);
      h.y = start.y + h.pushes.reduce((a, p) => a + p.movedY, 0);
      for (const m of dummies) {
        m.x = m.dummy!.homeX;
        m.y = m.dummy!.homeY;
        m.kbx = 0;
        m.kby = 0;
      }
    }
    series.push(damage / ((i + 1) * DPS_SAMPLE));
  }
  return { series, dps: series[series.length - 1], casts };
}

/**
 * Every combo the lab runs: each weapon base × primary × secondary (none, or
 * another element) on the basic attack (the weapon's default chain on the
 * pair), and each Primary or Ultimate form × element set × kind × payment as a
 * one-move chain, plus the form's default chain (`kind: 'default'`, what a held
 * button plays) × element set × payment. Ability setups carry a plain sword,
 * the pair `{ first, second }` (as the game limits abilities to the pair) and
 * its default basics. The only function here that knows the chain model.
 */
export function dpsCombos(registry: DataRegistry): DpsSetup[] {
  const out: DpsSetup[] = [];
  // The secondary outermost, so each dimension's values first appear in MANA_TYPES order.
  for (const base of registry.getGearBasesForSlot('weapon'))
    for (const secondary of [null, ...MANA_TYPES])
      for (const primary of MANA_TYPES) {
        if (primary === secondary) continue;
        out.push({
          view: 'basic',
          dims: { weapon: base.id, primary, secondary: secondary ?? 'none' },
          weapon: { baseId: base.id, primary, secondary },
          chains: {
            ...defaultChains(registry, primary, base.id),
            basic: defaultBasic(registry, base.id, primary, secondary),
          },
          hold: 'attack',
        });
      }
  // Ordered: the first element deals the damage and decides the reactions.
  const sets = [null, ...MANA_TYPES].flatMap((second) =>
    MANA_TYPES.filter((first) => first !== second).map((first) =>
      second ? [first, second] : [first],
    ),
  );
  for (const form of registry.getArpgData().forms) {
    if (form.slot === 'defensive') continue;
    for (const elements of sets)
      for (const kind of [...MOVE_KINDS, 'default' as const])
        for (const payment of ABILITY_PAYMENTS) {
          const [first, second = null] = elements;
          const kinds: MoveKind[] = kind === 'default' ? form.defaultChain : [kind];
          out.push({
            view: 'ability',
            dims: { form: form.id, first, second: second ?? 'none', kind, payment },
            weapon: { baseId: 'sword', primary: first, secondary: second },
            chains: {
              ...defaultChains(registry, first, 'sword'),
              basic: defaultBasic(registry, 'sword', first, second),
              [form.slot]: {
                moves: kinds.map((k) => ({ kind: k, form: form.id, elements })),
                payment,
              },
            },
            hold: { slot: ABILITY_SLOTS.indexOf(form.slot) },
          });
        }
  }
  return out;
}

/** A stable key: the view, then the `dims` values in order, e.g. `basic|sword|fire|none`. */
export function dpsKey(setup: DpsSetup): string {
  return [setup.view, ...Object.values(setup.dims)].join('|');
}
