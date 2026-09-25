import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttackButton, KEYBOARD_HINTS, PAD_HINTS, SkillBar } from '../arena/ArenaHud';
import type { ArenaHud } from '../arena/useArena';

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
    melee: true,
    basicComboNext: 1,
    potions: 3,
    monstersLeft: 5,
    monstersTotal: 8,
    boss: null,
    cleared: false,
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
        hints={KEYBOARD_HINTS}
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
        hints={PAD_HINTS}
      />,
    );
    expect(screen.getByTestId('dodge-button')).toHaveAttribute('data-riposte', 'true');
    expect(screen.getByTestId('dodge-button')).toHaveTextContent('LT');
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
});
