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
    basicComboNext: 1,
    basicComboLength: 3,
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

describe('SkillBar dodge button', () => {
  it('shows a pip per charge and dodges on press', () => {
    const onDodge = vi.fn();
    render(
      <SkillBar
        hud={hud()}
        onCast={() => {}}
        onAim={() => {}}
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
    const cooling: AbilityHud = {
      name: 'Fire Bolt',
      icon: '☄️',
      form: 'bolt',
      element: 'fire',
      elements: ['fire'],
      payment: 'mana',
      cost: 8,
      cooldown: 3,
      cooldownTotal: 5,
      charge: null,
      comboNext: 0,
      comboLength: 1,
      windup: null,
      affordable: true,
      ready: false,
    };
    const abilities = [cooling, { ...cooling, cooldown: 0, ready: true }];
    const bar = (galvanizedAt: number | null) => (
      <SkillBar
        hud={hud({ abilities, galvanizedAt, t: 10 })}
        onCast={() => {}}
        onAim={() => {}}
        onPotion={() => {}}
        onDodge={() => {}}
        hints={null}
      />
    );
    const spark = (slot: number) =>
      screen.getByTestId(`ability-${slot}`).querySelector('[data-spark]');
    const { rerender } = render(bar(9.8));
    expect(spark(0)).not.toBeNull();
    expect(spark(1)).toBeNull();
    rerender(bar(9.5));
    expect(spark(0)).toBeNull();
    rerender(bar(null));
    expect(spark(0)).toBeNull();
  });
});

describe('AttackButton', () => {
  it('holds while pressed and shows the melee combo', () => {
    const onAttack = vi.fn();
    render(<AttackButton hud={hud()} onAttack={onAttack} />);
    const button = screen.getByTestId('attack-button');
    expect(button.querySelectorAll('[data-combo]')).toHaveLength(3);
    expect(button.querySelector('[data-combo="next"]')).not.toBeNull();
    fireEvent.pointerDown(button);
    expect(onAttack).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(button);
    expect(onAttack).toHaveBeenLastCalledWith(false);
  });

  it('shows one pip per blow of the weapon string, for any weapon', () => {
    render(<AttackButton hud={hud({ basicComboLength: 2 })} onAttack={() => {}} />);
    expect(screen.getByTestId('attack-button').querySelectorAll('[data-combo]')).toHaveLength(2);
  });
});
