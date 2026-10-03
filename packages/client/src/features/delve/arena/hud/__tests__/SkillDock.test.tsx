import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  moveBeat,
  moveNumbers,
} from '@alloy/engine';
import { floatPay } from '../floatPay';
import { Vitals } from '../Vitals';
import { BossBar } from '../BossBar';
import { BuffRow } from '../BuffRow';
import { SkillDock, type SkillDockProps } from '../SkillDock';
import type { AbilityHud, ArenaHud } from '../../useArena';
import { getDelveRegistry } from '../../../registry';
import { FAMILY_STYLE } from '../../../runes/rune-style';
import { formatNumber } from '../../../format';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

const registry = getDelveRegistry();

/** The first rune of a family in the data. */
const runeOf = (family: string) => registry.getRunes().find((r) => r.family === family)!;

/** A HUD snapshot. */
function hud(over: Partial<ArenaHud> = {}): ArenaHud {
  return {
    hp: 100,
    maxHp: 100,
    mana: 50,
    manaMax: 60,
    abilities: [],
    busy: false,
    dodgeCharges: 1,
    dodgeMax: 2,
    dodgeRefill: 0.4,
    riposte: false,
    basicChainStep: 1,
    basicChainLength: 3,
    basicNextKind: 'light',
    basicHold: null,
    basicRunes: [],
    potions: 3,
    monstersLeft: 5,
    monstersTotal: 8,
    boss: null,
    cleared: false,
    barrier: null,
    galvanizedAt: null,
    t: 10,
    buffs: [],
    map: {
      width: 26,
      height: 40,
      view: { left: 0, top: 0, right: 26, bottom: 40 },
      hero: { x: 13, y: 20 },
      foes: [],
      drops: [],
      terrain: [],
    },
    ...over,
  };
}

describe('the life and mana bars', () => {
  it("shows Obsidian's barrier as a pale segment after the life (over its end at full life), and in the label", () => {
    const { rerender } = render(<Vitals hud={hud({ hp: 50, barrier: { hp: 20, max: 30 } })} />);
    const seg = screen.getByTestId('hp-barrier');
    expect(seg.style.left).toBe('50%');
    expect(seg.style.width).toBe('20%');
    expect(screen.getByTestId('hero-hp')).toHaveTextContent('50 / 100 · barrier 20');
    rerender(<Vitals hud={hud({ hp: 100, barrier: { hp: 20, max: 30 } })} />);
    expect(screen.getByTestId('hp-barrier').style.left).toBe('80%');
    rerender(<Vitals hud={hud()} />);
    expect(screen.queryByTestId('hp-barrier')).toBeNull();
    expect(screen.getByTestId('hero-hp')).toHaveTextContent(/^100 \/ 100$/);
  });

  it('writes the mana bar as current / max, whole numbers, keeping its label', () => {
    render(<Vitals hud={hud({ mana: 37.8, manaMax: 60.4 })} />);
    const bar = screen.getByTestId('mana-bar');
    expect(bar).toHaveTextContent('37 / 60');
    expect(bar).toHaveAttribute('aria-label', 'Mana 37 of 60');
  });
});

describe('the boss bar', () => {
  it('shows only while a boss lives, with its life', () => {
    const { rerender } = render(<BossBar hud={hud()} />);
    expect(screen.queryByTestId('boss-bar')).toBeNull();
    rerender(<BossBar hud={hud({ boss: { name: 'Grask', icon: '☠', hp: 40, maxHp: 160 } })} />);
    expect(screen.getByTestId('boss-bar')).toHaveTextContent('Grask');
    expect(screen.getByTestId('boss-bar')).toHaveTextContent('40 / 160');
  });
});

describe('the buff tiles', () => {
  it('draws a tile per buff with its seconds left; none without', () => {
    const { container, rerender } = render(
      <BuffRow
        buffs={[
          { id: 'riposte', left: 0.6, total: 1 },
          { id: 'quick', left: 3.2, total: 4 },
        ]}
      />,
    );
    const tiles = [...container.querySelectorAll('[data-buff]')];
    expect(tiles.map((t) => t.getAttribute('data-buff'))).toEqual(['riposte', 'quick']);
    expect(tiles.map((t) => t.textContent)).toEqual(['1s', '4s']);
    expect(screen.getByRole('img', { name: 'Quick, 4s left' })).toBe(tiles[1]);
    rerender(<BuffRow buffs={[]} />);
    expect(container.querySelector('[data-buff]')).toBeNull();
  });
});

describe('the floating spend', () => {
  it("floats each skill's spend from its own slot: mana, then charge, rounded; nothing for 0", () => {
    const original = Element.prototype.animate;
    const anims: { onfinish: (() => void) | null }[] = [];
    Element.prototype.animate = vi.fn(() => {
      const a = { onfinish: null as (() => void) | null };
      anims.push(a);
      return a as unknown as Animation;
    });
    render(
      <>
        {[0, 1, 2].map((s) => (
          <button key={s} type="button" data-testid={`ability-${s}`} />
        ))}
      </>,
    );
    const floats = (slot: number) =>
      [...screen.getByTestId(`ability-${slot}`).querySelectorAll('[data-pay]')] as HTMLElement[];

    floatPay({ kind: 'pay', slot: 0, mana: 16.4, charge: 0 });
    expect(floats(0).map((f) => f.textContent)).toEqual(['−16']);
    expect(floats(1)).toEqual([]);
    floatPay({ kind: 'pay', slot: 2, mana: 0, charge: 78.2 });
    expect(floats(2).map((f) => f.textContent)).toEqual(['−78 charge']);
    expect(floats(0)[0].style.color).not.toBe(floats(2)[0].style.color);

    floatPay({ kind: 'pay', slot: 1, mana: 0.4, charge: 0 });
    expect(floats(1)).toEqual([]);

    // At most three live per slot; each goes when its animation ends.
    for (let i = 0; i < 3; i++) floatPay({ kind: 'pay', slot: 0, mana: 8, charge: 0 });
    expect(floats(0)).toHaveLength(3);
    anims.forEach((a) => a.onfinish?.());
    expect(floats(0)).toHaveLength(0);
    expect(floats(2)).toHaveLength(0);
    Element.prototype.animate = original;
  });
});

/** A light Fire Bolt, ready: the first of a 1-move chain. */
const BOLT: AbilityHud = {
  name: 'Fire Bolt',
  icon: '☄️',
  form: 'bolt',
  element: 'fire',
  elements: ['fire'],
  payment: 'mana',
  cost: 8,
  cooldown: 0,
  cooldownTotal: 5,
  beat: false,
  charge: null,
  chainStep: 0,
  chainLength: 1,
  nextKind: 'light',
  hold: null,
  windup: null,
  affordable: true,
  ready: true,
  runes: [],
};

function dock(over: Partial<ArenaHud> = {}, props: Partial<SkillDockProps> = {}) {
  return (
    <SkillDock
      hud={hud(over)}
      onCast={() => {}}
      onDodge={() => {}}
      onPotion={() => {}}
      onAttack={() => {}}
      manualAttack={false}
      {...props}
    />
  );
}

describe('the skill dock', () => {
  beforeEach(() => useInputDeviceStore.setState({ device: 'keyboard' }));

  it("names each chain's next move, marks its step, and shows a hold's charge with its ticks", () => {
    const held = { ...BOLT, nextKind: 'hold' as const, chainStep: 1, chainLength: 4 };
    render(
      dock({ abilities: [{ ...held, hold: { charge: 0.5, stage: 1 } }, BOLT, BOLT], busy: true }),
    );
    const slot = screen.getByTestId('ability-0');
    expect(slot).toHaveAccessibleName('Primary: held Fire Bolt');
    expect(screen.getByTestId('ability-1')).toHaveAccessibleName('Defensive: light Fire Bolt');
    const row = slot.parentElement!;
    const steps = [...row.querySelectorAll('[data-chain]')];
    expect(steps.map((d) => d.getAttribute('data-chain'))).toEqual([
      'step',
      'next',
      'step',
      'step',
    ]);
    expect(slot.querySelector('[data-hold]')).toHaveAttribute('data-stage', '1');
    // One tick, at the halfway stage: the bar's end is full power.
    const ticks = [...slot.querySelectorAll('[data-tick]')] as HTMLElement[];
    expect(ticks.map((t) => t.style.left)).toEqual(['50%']);
    // The hold dims the others as a channel does, never its own slot.
    expect(slot.style.opacity).toBe('1');
    expect(screen.getByTestId('ability-1').style.opacity).toBe('0.5');
  });

  it("shows a dot per rune acting on the next move, in its family's colour; none without", () => {
    const shape = runeOf('shape');
    const sustain = runeOf('sustain');
    const runes = [
      { id: shape.id, tier: 3 as const },
      { id: sustain.id, tier: 1 as const },
    ];
    render(dock({ abilities: [{ ...BOLT, runes }, BOLT] }));
    const dots = [...screen.getByTestId('ability-0').querySelectorAll('[data-rune]')];
    expect(dots.map((d) => d.getAttribute('data-rune'))).toEqual([shape.id, sustain.id]);
    expect(dots[0]).toHaveStyle({ background: FAMILY_STYLE.shape.color });
    expect(dots[1]).toHaveStyle({ background: FAMILY_STYLE.sustain.color });
    expect(screen.getByTestId('ability-1').querySelector('[data-rune]')).toBeNull();
  });

  it("has no row for a skill the weapon doesn't carry; the others keep their slots", () => {
    render(dock({ abilities: [BOLT, null, { ...BOLT, name: 'Fire Nova' }] }));
    expect(screen.getByTestId('ability-0')).toBeInTheDocument();
    expect(screen.queryByTestId('ability-1')).toBeNull();
    expect(screen.getByTestId('ability-2')).toHaveAccessibleName('Ultimate: light Fire Nova');
  });

  it('a click on a slot casts it auto-aimed, and never takes the focus', () => {
    const onCast = vi.fn();
    render(dock({ abilities: [BOLT, BOLT, BOLT] }, { onCast }));
    const slot = screen.getByTestId('ability-2');
    expect(fireEvent.mouseDown(slot)).toBe(false); // default prevented: no focus
    fireEvent.click(slot);
    expect(onCast).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('writes the cost line in mana or charge, amber when it cannot be paid', () => {
    render(
      dock({
        abilities: [
          BOLT,
          { ...BOLT, payment: 'charge', charge: 0.62 },
          { ...BOLT, payment: 'cast', cost: 87.4, affordable: false },
        ],
      }),
    );
    expect(screen.getByTestId('ability-cost-0')).toHaveTextContent('8 mana');
    expect(screen.getByTestId('ability-cost-0').style.color).toBe('var(--k-mana)');
    expect(screen.getByTestId('ability-cost-1')).toHaveTextContent('charge 62%');
    expect(screen.getByTestId('ability-cost-2')).toHaveTextContent('87 mana · cast');
    expect(screen.getByTestId('ability-cost-2').style.color).toBe('var(--k-hot)');
  });

  it('draws the bound input for the device holding the lock', () => {
    const { rerender } = render(dock({ abilities: [BOLT] }));
    expect(screen.getByTestId('ability-0')).toHaveTextContent('Q');
    expect(screen.getByTestId('dodge-button')).toHaveTextContent('Space');
    act(() => useInputDeviceStore.setState({ device: 'gamepad' }));
    rerender(dock({ abilities: [BOLT] }));
    expect(screen.getByTestId('ability-0')).toHaveTextContent('RT');
    expect(screen.getByTestId('dodge-button')).toHaveTextContent('LT');
  });

  it('fills a cooling slot from the bottom with its seconds, and a beat without', () => {
    const fill = (slot: number) =>
      screen.getByTestId(`ability-${slot}`).querySelector('[data-sweep]') as HTMLElement | null;
    const cooling: AbilityHud = { ...BOLT, cooldown: 2.5, cooldownTotal: 5, ready: false };
    const beating: AbilityHud = { ...cooling, cooldown: 0.3, cooldownTotal: 0.6, beat: true };
    render(dock({ abilities: [cooling, beating, BOLT] }));
    expect(fill(0)).toHaveAttribute('data-sweep', 'cooldown');
    expect(fill(0)!.style.height).toBe('50%');
    expect(screen.getByTestId('ability-0')).toHaveTextContent('2.5');
    expect(fill(1)).toHaveAttribute('data-sweep', 'beat');
    expect(screen.getByTestId('ability-1')).not.toHaveTextContent('0.3');
    expect(screen.getByTestId('ability-1')).toHaveAttribute('data-ready', 'false');
    expect(fill(2)).toBeNull();
  });

  it('the fill glides between refreshes while it empties, and snaps when it rises', () => {
    const at = (cooldown: number) =>
      dock({ abilities: [{ ...BOLT, cooldown, cooldownTotal: 0.6, beat: true, ready: false }] });
    const fill = () => screen.getByTestId('ability-0').querySelector('[data-sweep]') as HTMLElement;
    const { rerender } = render(at(0.6));
    expect(fill().style.transition).toBe('none');
    rerender(at(0.3));
    expect(fill().style.height).toBe('50%');
    expect(fill().style.transition).toBe('height 80ms linear');
    // A refresh at the same height (a pause, a hit-stop) doesn't cut the glide short.
    rerender(at(0.3));
    expect(fill().style.transition).toBe('height 80ms linear');
    // A new beat starts: the fill jumps back up at once.
    rerender(at(0.6));
    expect(fill().style.transition).toBe('none');
  });

  it('sparks the slots still cooling down for 0.4 s after Galvanize', () => {
    const cooling: AbilityHud = { ...BOLT, cooldown: 3, ready: false };
    const abilities = [cooling, { ...cooling, cooldown: 0, ready: true }];
    const galvanize = (galvanizedAt: number | null) => dock({ abilities, galvanizedAt, t: 10 });
    const spark = (slot: number) =>
      screen.getByTestId(`ability-${slot}`).querySelector('[data-spark]');
    const { rerender } = render(galvanize(9.8));
    expect(spark(0)).not.toBeNull();
    expect(spark(1)).toBeNull();
    rerender(galvanize(9.5));
    expect(spark(0)).toBeNull();
    rerender(galvanize(null));
    expect(spark(0)).toBeNull();
    // Galvanize cuts cooldowns, not beats: a beat gets no spark.
    rerender(dock({ abilities: [{ ...cooling, beat: true }], galvanizedAt: 9.8, t: 10 }));
    expect(spark(0)).toBeNull();
  });

  it("shows the hovered skill's tooltip from the hero's resolved chain", () => {
    const stats = computeHeroStats({}, registry);
    const world = createSandboxWorld(registry, {
      depth: 5,
      stats,
      chains: defaultChains(registry, 'fire', null),
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
    const move = world.hero.chains[0]!.moves[0];
    const quick = runeOf('tempo');
    render(
      dock(
        { abilities: [{ ...BOLT, name: move.name, runes: [{ id: quick.id, tier: 2 }] }] },
        { world: { current: world } },
      ),
    );
    expect(screen.queryByTestId('skill-tooltip-0')).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('ability-0'));
    const tip = screen.getByTestId('skill-tooltip-0');
    expect(tip).toHaveTextContent(`${move.name}move 1 of 1 · light`);
    const bal = registry.getDelveBalance();
    expect(screen.getByTestId('num-hit')).toHaveTextContent(
      formatNumber(moveNumbers(stats, bal, move).hit),
    );
    expect(screen.getByTestId('num-cost')).toHaveTextContent(`${Math.round(move.cost)} mana`);
    expect(screen.getByTestId('num-beat')).toHaveTextContent(
      `${+moveBeat(bal, move, stats.tempo).toFixed(2)}s`,
    );
    expect(tip).toHaveTextContent(`${quick.name} II`);
    fireEvent.mouseLeave(screen.getByTestId('ability-0'));
    expect(screen.queryByTestId('skill-tooltip-0')).toBeNull();
  });

  it('opens the tooltip while its hold charges, without a world: the name line alone', () => {
    const held = { ...BOLT, nextKind: 'hold' as const, hold: { charge: 0.2, stage: 0 } };
    render(dock({ abilities: [held] }));
    expect(screen.getByTestId('skill-tooltip-0')).toHaveTextContent('Fire Boltmove 1 of 1 · hold');
    expect(screen.queryByTestId('num-hit')).toBeNull();
  });
});

describe('the dodge, potion and attack slots', () => {
  it('shows a pip per dodge charge, the next refilling, and dodges on a click', () => {
    const onDodge = vi.fn();
    render(dock({ riposte: true }, { onDodge }));
    const button = screen.getByTestId('dodge-button');
    expect(button).toHaveAttribute('data-charges', '1');
    expect(button).toHaveAttribute('data-riposte', 'true');
    expect(button.querySelectorAll('[data-pip="full"]')).toHaveLength(1);
    const empty = button.querySelector('[data-pip="empty"]')!;
    expect((empty.firstElementChild as HTMLElement).style.width).toBe('40%');
    fireEvent.click(button);
    expect(onDodge).toHaveBeenCalledTimes(1);
  });

  it('drinks a potion on a click, and is disabled with none left', () => {
    const onPotion = vi.fn();
    const { rerender } = render(dock({}, { onPotion }));
    expect(screen.getByTestId('potion-button')).toHaveTextContent('×3');
    fireEvent.click(screen.getByTestId('potion-button'));
    expect(onPotion).toHaveBeenCalledTimes(1);
    rerender(dock({ potions: 0 }, { onPotion }));
    expect(screen.getByTestId('potion-button')).toBeDisabled();
  });

  it('shows the Attack slot in both modes: "Auto", dimmed, or a tap in Manual', () => {
    const onAttack = vi.fn();
    const { rerender } = render(dock({}, { onAttack }));
    const button = screen.getByTestId('attack-button');
    expect(button).toHaveAttribute('data-mode', 'auto');
    expect(button).toHaveTextContent('Auto');
    expect(button.style.opacity).toBe('0.5');
    // Auto is a readout: no tab stop, and the pad's focus passes it by.
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('tabindex', '-1');
    expect(button).toHaveAttribute('data-pad-skip');
    fireEvent.click(button);
    expect(onAttack).not.toHaveBeenCalled();
    rerender(dock({}, { onAttack, manualAttack: true }));
    expect(button).toHaveAttribute('data-mode', 'manual');
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(button).not.toHaveAttribute('tabindex');
    expect(button).not.toHaveAttribute('data-pad-skip');
    fireEvent.click(button);
    expect(onAttack).toHaveBeenCalledTimes(1);
  });

  it("dots the Attack slot with the next blow's runes, and shows a held blow charging", () => {
    const tempo = runeOf('tempo');
    render(
      dock({
        basicRunes: [{ id: tempo.id, tier: 2 }],
        basicHold: { charge: 0.7, stage: 2 },
      }),
    );
    const button = screen.getByTestId('attack-button');
    expect(button.querySelector('[data-rune]')).toHaveStyle({
      background: FAMILY_STYLE.tempo.color,
    });
    expect(button.querySelector('[data-hold]')).toHaveAttribute('data-stage', '2');
  });

  it("puts the snapshot's buffs beside them", () => {
    render(dock({ buffs: [{ id: 'barrier', left: 5, total: 6 }] }));
    expect(screen.getByRole('img', { name: 'Barrier, 5s left' })).toBeInTheDocument();
  });

  it("shows a shrine's blessing as a tile with no countdown: for the floor or the dive", () => {
    render(
      dock({
        buffs: [
          { id: 'shrine', shrine: 'devotion', name: 'Shrine of Devotion', dive: true },
          { id: 'shrine', shrine: 'vigor', name: 'Shrine of Vigor', dive: false },
        ],
      }),
    );
    const dive = screen.getByRole('img', { name: 'Shrine of Devotion, this dive' });
    const floor = screen.getByRole('img', { name: 'Shrine of Vigor, this floor' });
    expect(dive.querySelector('[data-glyph="shrine"]')).not.toBeNull();
    expect(dive).toHaveStyle({ borderColor: '#feae34' });
    expect(floor).toHaveStyle({ borderColor: '#2ce8f5' });
    expect(floor).not.toHaveTextContent(/\ds/);
  });
});
