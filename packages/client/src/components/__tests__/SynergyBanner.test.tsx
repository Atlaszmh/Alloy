// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SynergyBanner } from '../SynergyBanner';
import type { ActiveSynergy } from '@alloy/engine';

const stubRegistry = {
  getSynergy: (id: string) => ({
    id,
    name: id.replace(/_/g, ' ').toUpperCase(),
    description: 'x',
    requiredAffixes: [],
    bonusEffects: [],
  }),
} as any;

const missingRegistry = {
  getSynergy: (_id: string) => undefined,
} as any;

describe('SynergyBanner', () => {
  it('renders nothing when no synergies are active or close', () => {
    const synergies: ActiveSynergy[] = [
      { synergyId: 'elementalist', isActive: false, missingCount: 3 },
    ];
    const { container } = render(<SynergyBanner synergies={synergies} registry={stubRegistry} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders active synergies with green state', () => {
    const synergies: ActiveSynergy[] = [
      { synergyId: 'elementalist', isActive: true, missingCount: 0 },
    ];
    render(<SynergyBanner synergies={synergies} registry={stubRegistry} />);
    const chip = screen.getByTestId('synergy-chip-elementalist');
    expect(chip.getAttribute('data-state')).toBe('active');
  });

  it('renders one-away synergies with pending state', () => {
    const synergies: ActiveSynergy[] = [
      { synergyId: 'assassin', isActive: false, missingCount: 1 },
    ];
    render(<SynergyBanner synergies={synergies} registry={stubRegistry} />);
    const chip = screen.getByTestId('synergy-chip-assassin');
    expect(chip.getAttribute('data-state')).toBe('pending');
    expect(chip.textContent ?? '').toMatch(/1 more/i);
  });

  it('prioritizes active synergies over pending when both exist', () => {
    const synergies: ActiveSynergy[] = [
      { synergyId: 'assassin', isActive: false, missingCount: 1 },
      { synergyId: 'elementalist', isActive: true, missingCount: 0 },
    ];
    const { container } = render(<SynergyBanner synergies={synergies} registry={stubRegistry} />);
    const chips = container.querySelectorAll('[data-testid^="synergy-chip-"]');
    expect(chips[0].getAttribute('data-testid')).toBe('synergy-chip-elementalist');
  });

  // ── Regression tests ──

  it('renders multiple active synergies in input array order', () => {
    const synergies: ActiveSynergy[] = [
      { synergyId: 'elementalist', isActive: true, missingCount: 0 },
      { synergyId: 'glass_cannon', isActive: true, missingCount: 0 },
    ];
    const { container } = render(<SynergyBanner synergies={synergies} registry={stubRegistry} />);
    const chips = container.querySelectorAll('[data-testid^="synergy-chip-"]');
    expect(chips.length).toBe(2);
    expect(chips[0].getAttribute('data-testid')).toBe('synergy-chip-elementalist');
    expect(chips[1].getAttribute('data-testid')).toBe('synergy-chip-glass_cannon');
  });

  it('does not crash when synergies array is empty', () => {
    const { container } = render(<SynergyBanner synergies={[]} registry={stubRegistry} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders fallback synergyId text when registry has no definition', () => {
    const synergies: ActiveSynergy[] = [
      { synergyId: 'nonexistent', isActive: true, missingCount: 0 },
    ];
    render(<SynergyBanner synergies={synergies} registry={missingRegistry} />);
    const chip = screen.getByTestId('synergy-chip-nonexistent');
    expect(chip.textContent ?? '').toMatch(/nonexistent/);
  });
});
