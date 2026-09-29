import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttackButton, SkillBar, Vitals, keyHints, padHints } from '../arena/ArenaHud';
import { DEFAULT_CONTROLS } from '@/features/controls/controls';
import type { AbilityHud, ArenaHud } from '../arena/useArena';

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
  charge: null,
  chainStep: 0,
  chainLength: 1,
  nextKind: 'light',
  hold: null,
  windup: null,
  affordable: true,
  ready: true,
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
    // The hold dims the others as a channel does, never its own button.
    expect(button.style.opacity).toBe('1');
    expect(screen.getByTestId('ability-1').style.opacity).toBe('0.5');
    expect(screen.getByTestId('ability-1').querySelector('[data-chain]')).toBeNull();
  });

  it('a press aims (a hold move charges meanwhile), a release casts, and a lost pointer cancels', () => {
    const onCast = vi.fn();
    const onAim = vi.fn();
    const onCancel = vi.fn();
    render(bar({ abilities: [BOLT] }, { onCast, onAim, onCancel }));
    const button = screen.getByTestId('ability-0');
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onAim).toHaveBeenLastCalledWith(0, { x: 0, y: 0 });
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
  });
});
