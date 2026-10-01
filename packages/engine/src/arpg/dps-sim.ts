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
import { runeFits } from '../loot/runes.js';
import type { RuneDef, RuneTier } from '../types/rune.js';

/**
 * The DPS Lab's sim (a dev tool; see the DPS Lab spec): one loadout on the
 * Training Grounds' dummies for DPS_SECONDS, holding one button, with a plain
 * weapon at a depth and nothing else. Pure and deterministic: every run uses
 * the sandbox's world seed.
 */

/** One run: a whole loadout, labelled by the dimensions the lab filters and colours by. */
export interface DpsSetup {
  view: 'basic' | 'ability' | 'rune';
  /**
   * Filterable dimensions in display order, e.g. { weapon, primary, secondary },
   * { form, first, second, kind, payment } (a kind, or 'default' for the form's default
   * chain) or { rune, on, elements, tier } (a rune's id, 'a+b+c' for a set, 'none' for the
   * baseline; an attack form or a weapon; 'fire' or 'fire+frost'; 'III', 'none' for the
   * baseline). Values are short ids; a missing element is 'none'.
   */
  dims: Record<string, string>;
  /** The `dpsKey` of the row it is measured against: a rune row's baseline (no rune). */
  base?: string;
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
 * its default basics. Then the rune view (`runeRows`). With `runeSetup`, the
 * only code here that knows the chain model.
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
  out.push(...runeRows(registry));
  return out;
}

/** A stable key: the view, then the `dims` values in order, e.g. `basic|sword|fire|none`. */
export function dpsKey(setup: DpsSetup): string {
  return [setup.view, ...Object.values(setup.dims)].join('|');
}

/** The rune view's tier (see the runes spec's gate). */
const RUNE_TIER: RuneTier = 3;
const FIRE: ManaType[] = ['fire'];
const FIRE_FROST: ManaType[] = ['fire', 'frost'];

/** The Primary's and the Ultimate's forms: what a held ability button attacks with. */
function attackForms(registry: DataRegistry) {
  return registry.getArpgData().forms.filter((f) => f.slot !== 'defensive');
}

/** Whether `def` fits `on`: an attack form, or a weapon's blows (the fit ignores a blow's kind). */
function fitsOn(registry: DataRegistry, def: RuneDef, on: string): boolean {
  const form = attackForms(registry).find((f) => f.id === on);
  return runeFits(def, form ? { form: form.id } : { weapon: on, kind: 'medium' });
}

/**
 * The elements a set of runes runs on: Fire + Frost when one of them feeds
 * reactions (its knobs set `catalyst` or `stacksBonus`: Volatile, Saturate), so
 * Melt fires and its gate can fail; else Fire.
 */
function runeElements(registry: DataRegistry, ids: readonly string[]): ManaType[] {
  const reacts = ids.some((id) =>
    registry.getRune(id).tiers.some((t) => t.catalyst !== undefined || t.stacksBonus !== undefined),
  );
  return reacts ? FIRE_FROST : FIRE;
}

/**
 * A rune-view setup: runes `ids` at tier III in every move of form `on`'s
 * default chain (paid with mana, on a sword), or in every blow of weapon
 * `on`'s default basic chain, on `elements` (Frost the pair's secondary). No
 * ids is the baseline that every such setup is measured against (`base`).
 */
function runeSetup(
  registry: DataRegistry,
  on: string,
  ids: readonly string[],
  elements: ManaType[],
): DpsSetup {
  const runes = ids.map((id) => ({ id, tier: RUNE_TIER }));
  const [first, second = null] = elements;
  const form = attackForms(registry).find((f) => f.id === on);
  const baseId = form ? 'sword' : on;
  const chains: Chains = {
    ...defaultChains(registry, first, baseId),
    basic: defaultBasic(registry, baseId, first, second),
  };
  if (form)
    chains[form.slot] = {
      moves: form.defaultChain.map((kind) => ({
        kind,
        form: form.id,
        elements: [...elements],
        runes: [...runes],
      })),
      payment: 'mana',
    };
  else chains.basic = chains.basic.map((b) => ({ ...b, runes: [...runes] }));
  const socketed = ids.length > 0;
  return {
    view: 'rune',
    dims: {
      rune: socketed ? ids.join('+') : 'none',
      on,
      elements: elements.join('+'),
      tier: socketed ? 'III' : 'none',
    },
    ...(socketed ? { base: dpsKey(runeSetup(registry, on, [], elements)) } : {}),
    weapon: { baseId, primary: first, secondary: second },
    chains,
    hold: form ? { slot: ABILITY_SLOTS.indexOf(form.slot) } : 'attack',
  };
}

/**
 * The rune view: a baseline per attack form and weapon on Fire and on Fire +
 * Frost, then each rune at tier III on every attack form and weapon it fits,
 * on its elements (`runeElements`).
 */
function runeRows(registry: DataRegistry): DpsSetup[] {
  const ons = [
    ...attackForms(registry).map((f) => f.id),
    ...registry.getGearBasesForSlot('weapon').map((b) => b.id),
  ];
  return [
    ...[FIRE, FIRE_FROST].flatMap((elements) =>
      ons.map((on) => runeSetup(registry, on, [], elements)),
    ),
    ...registry
      .getRunes()
      .flatMap((def) =>
        ons
          .filter((on) => fitsOn(registry, def, on))
          .map((on) => runeSetup(registry, on, [def.id], runeElements(registry, [def.id]))),
      ),
  ];
}

/**
 * The combo gate's setups (see the runes spec; wave 3 runs them): every set of
 * three runes that fit attack form or weapon `on`, in `runes.json` order, at
 * tier III on every move or blow, on Fire + Frost when the set feeds
 * reactions, else Fire, each measured against its `base` in the rune view.
 * Not in the grid: up to 286 a form.
 */
export function runeComboSetups(registry: DataRegistry, on: string): DpsSetup[] {
  const fit = registry
    .getRunes()
    .filter((def) => fitsOn(registry, def, on))
    .map((def) => def.id);
  return fit.flatMap((a, i) =>
    fit
      .slice(i + 1)
      .flatMap((b, j) =>
        fit
          .slice(i + j + 2)
          .map((c) => runeSetup(registry, on, [a, b, c], runeElements(registry, [a, b, c]))),
      ),
  );
}
