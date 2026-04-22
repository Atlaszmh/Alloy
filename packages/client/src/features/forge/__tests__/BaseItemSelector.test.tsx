import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BaseItemSelector } from '../BaseItemSelector.js';

const mockWeapons = [
  { id: 'sword', type: 'weapon' as const, name: 'Sword', baseStats: { physicalDamage: 40, attackSpeed: 1.8 }, description: 'Balanced' },
  { id: 'dagger', type: 'weapon' as const, name: 'Dagger', baseStats: { physicalDamage: 20, attackSpeed: 1.0 }, description: 'Fast' },
];

const mockArmors = [
  { id: 'plate', type: 'armor' as const, name: 'Plate', baseStats: { armor: 80, hp: 40 }, description: 'Heavy' },
  { id: 'robe', type: 'armor' as const, name: 'Robe', baseStats: { armor: 20, hp: 10 }, description: 'Light' },
];

describe('BaseItemSelector', () => {
  it('renders weapons and armors as cards', () => {
    render(<BaseItemSelector weapons={mockWeapons} armors={mockArmors} onSelect={vi.fn()} />);
    expect(screen.getByText('Sword')).toBeTruthy();
    expect(screen.getByText('Dagger')).toBeTruthy();
    expect(screen.getByText('Plate')).toBeTruthy();
    expect(screen.getByText('Robe')).toBeTruthy();
  });

  it('disables Confirm until both a weapon and an armor are selected', () => {
    const onSelect = vi.fn();
    render(<BaseItemSelector weapons={mockWeapons} armors={mockArmors} onSelect={onSelect} />);
    const confirm = screen.getByRole('button', { name: /^confirm$/i }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(screen.getByText('Sword'));
    expect(confirm.disabled).toBe(true);

    fireEvent.click(screen.getByText('Plate'));
    expect(confirm.disabled).toBe(false);
  });

  it('calls onSelect with both selections when confirmed', () => {
    const onSelect = vi.fn();
    render(<BaseItemSelector weapons={mockWeapons} armors={mockArmors} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Sword'));
    fireEvent.click(screen.getByText('Plate'));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(mockWeapons[0], mockArmors[0]);
  });

  it('Random picks one of each without requiring selection', () => {
    const onSelect = vi.fn();
    render(<BaseItemSelector weapons={mockWeapons} armors={mockArmors} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /^random$/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [weapon, armor] = onSelect.mock.calls[0];
    expect(mockWeapons).toContain(weapon);
    expect(mockArmors).toContain(armor);
  });
});
