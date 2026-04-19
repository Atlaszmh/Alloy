// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscoveryCounter } from '../PhaseRouter';

describe('DiscoveryCounter', () => {
  it('renders "★ 0" initially when no discoveries have been recorded', () => {
    render(<DiscoveryCounter count={0} />);
    const chip = screen.getByTestId('discovery-counter');
    expect(chip.textContent?.replace(/\s+/g, ' ').trim()).toBe('★ 0');
    expect(chip.getAttribute('data-count')).toBe('0');
  });

  it('reflects the provided count', () => {
    render(<DiscoveryCounter count={7} />);
    const chip = screen.getByTestId('discovery-counter');
    expect(chip.textContent?.replace(/\s+/g, ' ').trim()).toBe('★ 7');
    expect(chip.getAttribute('data-count')).toBe('7');
  });

  it('applies the discovery-pop class when count increments', () => {
    const { rerender } = render(<DiscoveryCounter count={2} />);
    const chip = screen.getByTestId('discovery-counter');
    // Initial render: no pop class (no increment has happened yet)
    expect(chip.classList.contains('discovery-pop')).toBe(false);

    rerender(<DiscoveryCounter count={3} />);
    expect(chip.classList.contains('discovery-pop')).toBe(true);
  });

  it('does not apply the pop class when count stays the same or decreases', () => {
    const { rerender } = render(<DiscoveryCounter count={5} />);
    const chip = screen.getByTestId('discovery-counter');

    rerender(<DiscoveryCounter count={5} />);
    expect(chip.classList.contains('discovery-pop')).toBe(false);

    rerender(<DiscoveryCounter count={4} />);
    expect(chip.classList.contains('discovery-pop')).toBe(false);
  });
});
