import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttackButton, SkillBar, Vitals, floatPay, keyHints, padHints } from '../arena/ArenaHud';
import { DEFAULT_CONTROLS } from '@/features/controls/controls';
import type { AbilityHud, ArenaHud } from '../arena/useArena';
import { getDelveRegistry } from '../registry';
import { FAMILY_STYLE } from '../runes/rune-style';

/** The first rune of a family in the data. */
const runeOf = (family: string) =>
  getDelveRegistry()
    .getRunes()
    .find((r) => r.family === family)!;

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
    ...over,
  };
}

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

function bar(over: Partial<ArenaHud>, on: Partial<Parameters<typeof SkillBar>[0]> = {}) {
  return (
    <SkillBar
      hud={hud(over)}
      onCast={() => {}}
      onAim={() => {}}
      onCancel={() => {}}
      onPotion={() => {}}
      onDodge={() => {}}
      hints={null}
      {...on}
    />
  );
}

describe('the ability buttons', () => {
  it("names each chain's next move and shows its step dots, its kind and a hold's charge", () => {
    const held = { ...BOLT, nextKind: 'hold' as const, chainStep: 1, chainLength: 4 };
    render(
      bar({
        abilities: [{ ...held, hold: { charge: 0.5, stage: 1 } }, BOLT, BOLT],
        busy: true,
      }),
    );
    const button = screen.getByTestId('ability-0');
    expect(button).toHaveAccessibleName('Primary: held Fire Bolt');
    expect(screen.getByTestId('ability-1')).toHaveAccessibleName('Defensive: light Fire Bolt');
    const dots = [...button.querySelectorAll('[data-chain]')];
    expect(dots.map((d) => d.getAttribute('data-chain'))).toEqual(['step', 'next', 'step', 'step']);
    expect(button.querySelector('[data-kind="hold"]')).toHaveTextContent('◉');
    expect(button.querySelector('[data-hold]')).toHaveAttribute('data-stage', '1');
    // One tick, at the halfway stage: the bar's end is full power.
    const ticks = [...button.querySelectorAll('[data-tick]')] as HTMLElement[];
    expect(ticks.map((t) => t.style.left)).toEqual(['50%']);
    // The hold dims the others as a channel does, never its own button.
    expect(button.style.opacity).toBe('1');
    expect(screen.getByTestId('ability-1').style.opacity).toBe('0.5');
    expect(screen.getByTestId('ability-1').querySelector('[data-chain]')).toBeNull();
  });

  it("shows a dot per rune acting on the next move, in its family's colour; none without", () => {
    const shape = runeOf('shape');
    const sustain = runeOf('sustain');
    const runes = [
      { id: shape.id, tier: 3 as const },
      { id: sustain.id, tier: 1 as const },
    ];
    render(bar({ abilities: [{ ...BOLT, runes }, BOLT] }));
    const dots = [...screen.getByTestId('ability-0').querySelectorAll('[data-rune]')];
    expect(dots.map((d) => d.getAttribute('data-rune'))).toEqual([shape.id, sustain.id]);
    expect(dots[0]).toHaveStyle({ background: FAMILY_STYLE.shape.color });
    expect(dots[1]).toHaveStyle({ background: FAMILY_STYLE.sustain.color });
    expect(screen.getByTestId('ability-1').querySelector('[data-rune]')).toBeNull();
  });

  it("hides the button of a skill the weapon doesn't carry; the others keep their slots", () => {
    render(bar({ abilities: [BOLT, null, { ...BOLT, name: 'Fire Nova' }] }));
    expect(screen.getByTestId('ability-0')).toBeInTheDocument();
    expect(screen.queryByTestId('ability-1')).toBeNull();
    expect(screen.getByTestId('ability-2')).toHaveAccessibleName('Ultimate: light Fire Nova');
  });

  it('a press aims (a hold move charges meanwhile), a release casts, and a lost pointer cancels', () => {
    const onCast = vi.fn();
    const onAim = vi.fn();
    const onCancel = vi.fn();
    render(bar({ abilities: [BOLT] }, { onCast, onAim, onCancel }));
    const button = screen.getByTestId('ability-0');
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onAim).toHaveBeenLastCalledWith(0, { x: 0, y: 0 }, true);
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onCast).toHaveBeenLastCalledWith(0); // a tap auto-aims
    expect(onAim).toHaveBeenLastCalledWith(null);
    // The browser takes the pointer away: cancelled.
    fireEvent.pointerDown(button, { pointerId: 3, clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(button, { pointerId: 3 });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it('a slow press of any move let go in place casts it, auto-aimed, as a key does', () => {
    const onCast = vi.fn();
    const onCancel = vi.fn();
    render(bar({ abilities: [BOLT] }, { onCast, onCancel }));
    const button = screen.getByTestId('ability-0');
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    // Held past a tap, then let go where it began (jsdom lays the button out at 0, 0).
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 0, clientY: 0 });
    now.mockReturnValue(1800);
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onCast).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenLastCalledWith(0);
    expect(onCancel).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('a thumb jittering over the rim stays in place; only out past the drag threshold and back cancels', () => {
    const onCast = vi.fn();
    const onCancel = vi.fn();
    render(bar({ abilities: [{ ...BOLT, nextKind: 'hold' as const }] }, { onCast, onCancel }));
    const button = screen.getByTestId('ability-0');
    // A 64 px button: centre (32, 32), radius 32.
    button.getBoundingClientRect = () => new DOMRect(0, 0, 64, 64);
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const hold = (id: number, path: number[], upX: number) => {
      fireEvent.pointerDown(button, { pointerId: id, clientX: 32, clientY: 32 });
      for (const x of path)
        fireEvent.pointerMove(button, { pointerId: id, clientX: x, clientY: 32 });
      now.mockReturnValue(performance.now() + 800);
      fireEvent.pointerUp(button, { pointerId: id, clientX: upX, clientY: 32 });
    };
    // Over the rim by 8 px and back, let go inside, then let go 8 px past the rim: both in place.
    hold(1, [72, 40], 40);
    hold(2, [72], 72);
    expect(onCast.mock.calls).toEqual([[0], [0]]);
    expect(onCancel).not.toHaveBeenCalled();
    // Out past the rim and the drag threshold, then back: cancelled.
    hold(3, [110, 40], 40);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('says whether the pointer is still on its button, so the aim marker waits for a drag', () => {
    const onAim = vi.fn();
    render(bar({ abilities: [BOLT] }, { onAim }));
    const button = screen.getByTestId('ability-0');
    button.getBoundingClientRect = () => new DOMRect(0, 0, 64, 64);
    const at = (x: number) => ({ pointerId: 1, clientX: x, clientY: 32 });
    fireEvent.pointerDown(button, at(32));
    fireEvent.pointerMove(button, at(72)); // over the rim, within the drag threshold
    fireEvent.pointerMove(button, at(110));
    fireEvent.pointerMove(button, at(40));
    expect(onAim.mock.calls.map((c) => c[2])).toEqual([true, true, false, true]);
  });

  it('a hold held in place fires on release; dragged out and back, it cancels', () => {
    const onCast = vi.fn();
    const onCancel = vi.fn();
    const hold = { ...BOLT, nextKind: 'hold' as const };
    render(bar({ abilities: [hold] }, { onCast, onCancel }));
    const button = screen.getByTestId('ability-0');
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 0, clientY: 0 });
    now.mockReturnValue(1800);
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onCast).toHaveBeenLastCalledWith(0);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.pointerDown(button, { pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(button, { pointerId: 2, clientX: 60, clientY: 0 });
    fireEvent.pointerMove(button, { pointerId: 2, clientX: 0, clientY: 0 });
    now.mockReturnValue(2600);
    fireEvent.pointerUp(button, { pointerId: 2, clientX: 0, clientY: 0 });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it('a second button pressed while one is held lets the first go there and then, as a second key does; lifting the first then does nothing', () => {
    const onCast = vi.fn();
    const onAim = vi.fn();
    const onCancel = vi.fn();
    // The Primary's hold move charging.
    const charging = { ...BOLT, nextKind: 'hold' as const, hold: { charge: 0.4, stage: 1 } };
    render(bar({ abilities: [charging, BOLT, BOLT], busy: true }, { onCast, onAim, onCancel }));
    const [q, e, r] = [0, 1, 2].map((s) => screen.getByTestId(`ability-${s}`));
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    fireEvent.pointerDown(q, { pointerId: 1, clientX: 0, clientY: 0 });
    now.mockReturnValue(1800);
    fireEvent.pointerDown(e, { pointerId: 2, clientX: 0, clientY: 0 });
    // Q lets go in place (auto-aimed), and E aims.
    expect(onCast.mock.calls).toEqual([[0]]);
    expect(onAim).toHaveBeenLastCalledWith(1, { x: 0, y: 0 }, true);
    // Q's finger moves on and lifts: nothing, and E still aims.
    fireEvent.pointerMove(q, { pointerId: 1, clientX: 90, clientY: 0 });
    fireEvent.pointerUp(q, { pointerId: 1, clientX: 90, clientY: 0 });
    expect(onCast).toHaveBeenCalledTimes(1);
    expect(onAim).toHaveBeenLastCalledWith(1, { x: 0, y: 0 }, true);
    fireEvent.pointerUp(e, { pointerId: 2, clientX: 0, clientY: 0 });
    expect(onCast.mock.calls.map((c) => c[0])).toEqual([0, 1]);
    // Dragged out when another button comes down, a press casts where it was aimed.
    fireEvent.pointerDown(q, { pointerId: 3, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(q, { pointerId: 3, clientX: 90, clientY: 0 });
    fireEvent.pointerDown(r, { pointerId: 4, clientX: 0, clientY: 0 });
    expect(onCast).toHaveBeenLastCalledWith(0, { x: 90, y: 0 });
    expect(onCancel).not.toHaveBeenCalled();
    now.mockRestore();
  });
});

describe('SkillBar dodge button', () => {
  it('shows a pip per charge and dodges on press', () => {
    const onDodge = vi.fn();
    render(
      <SkillBar
        hud={hud()}
        onCast={() => {}}
        onAim={() => {}}
        onCancel={() => {}}
        onPotion={() => {}}
        onDodge={onDodge}
        hints={keyHints(DEFAULT_CONTROLS)}
      />,
    );
    const button = screen.getByTestId('dodge-button');
    expect(button).toHaveAttribute('data-charges', '1');
    expect(button.querySelectorAll('[data-pip="full"]')).toHaveLength(1);
    expect(button.querySelectorAll('[data-pip="empty"]')).toHaveLength(1);
    expect(button).toHaveTextContent('Space');
    fireEvent.pointerDown(button);
    expect(onDodge).toHaveBeenCalledTimes(1);
  });

  it('glows while the riposte is armed', () => {
    render(
      <SkillBar
        hud={hud({ riposte: true })}
        onCast={() => {}}
        onAim={() => {}}
        onCancel={() => {}}
        onPotion={() => {}}
        onDodge={() => {}}
        hints={padHints(DEFAULT_CONTROLS)}
      />,
    );
    expect(screen.getByTestId('dodge-button')).toHaveAttribute('data-riposte', 'true');
    expect(screen.getByTestId('dodge-button')).toHaveTextContent('LT');
  });
});

describe('the reactions on the HUD', () => {
  it("shows Obsidian's barrier as a pale segment after the life (over its end at full life)", () => {
    const { rerender } = render(<Vitals hud={hud({ hp: 50, barrier: { hp: 20, max: 30 } })} />);
    const seg = screen.getByTestId('hp-barrier');
    expect(seg.style.left).toBe('50%');
    expect(seg.style.width).toBe('20%');
    rerender(<Vitals hud={hud({ hp: 100, barrier: { hp: 20, max: 30 } })} />);
    expect(screen.getByTestId('hp-barrier').style.left).toBe('80%');
    rerender(<Vitals hud={hud()} />);
    expect(screen.queryByTestId('hp-barrier')).toBeNull();
  });

  it('sweeps while a move cools, with its seconds, and while the slot waits out its beat, without', () => {
    const sweep = (slot: number) =>
      screen.getByTestId(`ability-${slot}`).querySelector('[data-sweep]') as HTMLElement | null;
    const cooling: AbilityHud = { ...BOLT, cooldown: 2.5, cooldownTotal: 5, ready: false };
    const beating: AbilityHud = { ...cooling, cooldown: 0.3, cooldownTotal: 0.6, beat: true };
    render(bar({ abilities: [cooling, beating, BOLT] }));
    expect(sweep(0)).toHaveAttribute('data-sweep', 'cooldown');
    expect(sweep(0)!.style.getPropertyValue('--delve-sweep')).toBe('180deg');
    expect(screen.getByTestId('ability-0')).toHaveTextContent('2.5');
    expect(sweep(1)).toHaveAttribute('data-sweep', 'beat');
    expect(sweep(1)!.style.getPropertyValue('--delve-sweep')).toBe('180deg');
    expect(screen.getByTestId('ability-1')).not.toHaveTextContent('0.3');
    expect(screen.getByTestId('ability-1')).toHaveAttribute('data-ready', 'false');
    expect(sweep(2)).toBeNull();
  });

  it('the sweep glides between refreshes while it empties, and snaps when it rises', () => {
    const at = (cooldown: number) =>
      bar({
        abilities: [
          { ...BOLT, cooldown, cooldownTotal: 0.6, beat: true, ready: false },
          BOLT,
          BOLT,
        ],
      });
    const sweep = () =>
      screen.getByTestId('ability-0').querySelector('[data-sweep]') as HTMLElement;
    const { rerender } = render(at(0.6));
    expect(sweep().style.transition).toBe('none');
    rerender(at(0.3));
    expect(sweep().style.getPropertyValue('--delve-sweep')).toBe('180deg');
    expect(sweep().style.transition).toBe('--delve-sweep 80ms linear');
    // A refresh at the same angle (a pause, a hit-stop) doesn't cut the glide short.
    rerender(at(0.3));
    expect(sweep().style.transition).toBe('--delve-sweep 80ms linear');
    // A new beat starts: the sweep jumps back up at once.
    rerender(at(0.6));
    expect(sweep().style.transition).toBe('none');
  });

  it('sparks the buttons still cooling down for 0.4 s after Galvanize', () => {
    const cooling: AbilityHud = { ...BOLT, cooldown: 3, ready: false };
    const abilities = [cooling, { ...cooling, cooldown: 0, ready: true }];
    const galvanize = (galvanizedAt: number | null) => bar({ abilities, galvanizedAt, t: 10 });
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
    rerender(bar({ abilities: [{ ...cooling, beat: true }], galvanizedAt: 9.8, t: 10 }));
    expect(spark(0)).toBeNull();
  });
});

describe('AttackButton', () => {
  it('holds while pressed and shows the basic chain', () => {
    const onAttack = vi.fn();
    render(<AttackButton hud={hud()} onAttack={onAttack} />);
    const button = screen.getByTestId('attack-button');
    expect(button.querySelectorAll('[data-chain]')).toHaveLength(3);
    expect(button.querySelector('[data-chain="next"]')).not.toBeNull();
    expect(button.querySelector('[data-kind="light"]')).toHaveTextContent('▪');
    fireEvent.pointerDown(button);
    expect(onAttack).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(button);
    expect(onAttack).toHaveBeenLastCalledWith(false);
  });

  it('shows one pip per blow of the basic chain, and a held blow charging', () => {
    const basic = { basicChainLength: 2, basicNextKind: 'hold' as const };
    render(
      <AttackButton
        hud={hud({ ...basic, basicHold: { charge: 0.7, stage: 2 } })}
        onAttack={() => {}}
      />,
    );
    const button = screen.getByTestId('attack-button');
    expect(button.querySelectorAll('[data-chain]')).toHaveLength(2);
    expect(button.querySelector('[data-kind="hold"]')).toHaveTextContent('◉');
    expect(button.querySelector('[data-hold]')).toHaveAttribute('data-stage', '2');
    expect(button.querySelectorAll('[data-tick]')).toHaveLength(1);
  });
});

describe('AttackButton runes', () => {
  it('shows a dot per rune acting on the next blow; none without', () => {
    const tempo = runeOf('tempo');
    const { rerender } = render(
      <AttackButton hud={hud({ basicRunes: [{ id: tempo.id, tier: 2 }] })} onAttack={() => {}} />,
    );
    const button = screen.getByTestId('attack-button');
    expect(button.querySelectorAll('[data-rune]')).toHaveLength(1);
    expect(button.querySelector('[data-rune]')).toHaveStyle({
      background: FAMILY_STYLE.tempo.color,
    });
    rerender(<AttackButton hud={hud()} onAttack={() => {}} />);
    expect(button.querySelector('[data-rune]')).toBeNull();
  });
});

describe('mana on the HUD', () => {
  it('writes the mana bar as current / max, whole numbers, keeping its label', () => {
    render(<Vitals hud={hud({ mana: 37.8, manaMax: 60.4 })} />);
    const bar = screen.getByTestId('mana-bar');
    expect(bar).toHaveTextContent('37 / 60');
    expect(bar).toHaveAttribute('aria-label', 'Mana 37 of 60');
  });

  it("floats each skill's spend above its own button: mana, then charge, rounded; nothing for 0", () => {
    const original = Element.prototype.animate;
    const anims: { onfinish: (() => void) | null }[] = [];
    const animate = vi.fn(() => {
      const a = { onfinish: null as (() => void) | null };
      anims.push(a);
      return a as unknown as Animation;
    });
    Element.prototype.animate = animate;
    render(bar({ abilities: [BOLT, BOLT, { ...BOLT, payment: 'charge', charge: 0 }] }));
    const floats = (slot: number) =>
      [...screen.getByTestId(`ability-${slot}`).querySelectorAll('[data-pay]')] as HTMLElement[];

    floatPay({ kind: 'pay', slot: 0, mana: 16.4, charge: 0 });
    expect(floats(0).map((f) => f.textContent)).toEqual(['−16']);
    expect(floats(1)).toEqual([]);
    floatPay({ kind: 'pay', slot: 2, mana: 0, charge: 78.2 });
    expect(floats(2).map((f) => f.textContent)).toEqual(['−78 ⚡']);
    expect(floats(0)[0].style.color).not.toBe(floats(2)[0].style.color);

    floatPay({ kind: 'pay', slot: 1, mana: 0.4, charge: 0 });
    expect(floats(1)).toEqual([]);

    // At most three live per button; each goes when its animation ends.
    for (let i = 0; i < 3; i++) floatPay({ kind: 'pay', slot: 0, mana: 8, charge: 0 });
    expect(floats(0)).toHaveLength(3);
    anims.forEach((a) => a.onfinish?.());
    expect(floats(0)).toHaveLength(0);
    expect(floats(2)).toHaveLength(0);
    Element.prototype.animate = original;
  });
});
