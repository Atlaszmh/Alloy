import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BaseItemSelector } from '../BaseItemSelector.js';

const mockWeapons = [
  { id: 'sword', type: 'weapon' as const, name: 'Sword', baseStats: { physicalDamage: 40, attackInterval: 54 }, description: 'Balanced' },
  { id: 'dagger', type: 'weapon' as const, name: 'Dagger', baseStats: { physicalDamage: 20, attackInterval: 30 }, description: 'Fast' },
];

describe('BaseItemSelector', () => {
  it('renders all items as cards', () => {
    render(<BaseItemSelector itemType="weapon" items={mockWeapons} onSelect={vi.fn()} />);
    expect(screen.getByText('Sword')).toBeTruthy();
    expect(screen.getByText('Dagger')).toBeTruthy();
  });
  it('calls onSelect when clicked and confirmed', () => {
    const onSelect = vi.fn();
    render(<BaseItemSelector itemType="weapon" items={mockWeapons} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Sword'));
    fireEvent.click(screen.getByText(/confirm/i));
    expect(onSelect).toHaveBeenCalledWith(mockWeapons[0]);
  });
  it('has a random button', () => {
    const onSelect = vi.fn();
    render(<BaseItemSelector itemType="weapon" items={mockWeapons} onSelect={onSelect} />);
    fireEvent.click(screen.getByText(/random/i));
    expect(onSelect).toHaveBeenCalled();
  });
});
