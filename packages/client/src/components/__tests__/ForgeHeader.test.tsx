// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ForgeHeader } from '../ForgeHeader';
import type { DerivedStats } from '@alloy/engine';

const STATS: DerivedStats = {
  maxHP: 100,
  physicalDamage: 10,
  elementalDamage: { fire: 0, cold: 0, lightning: 0, poison: 0, shadow: 0, chaos: 0 },
  armor: 0,
  critChance: 0,
} as unknown as DerivedStats;

const defaults = {
  round: 1,
  flux: 3,
  maxFlux: 8,
  stats: STATS,
  gemDamage: [],
  onDone: vi.fn(),
};

function renderHeader(props: Partial<React.ComponentProps<typeof ForgeHeader>> = {}) {
  return render(
    <MemoryRouter>
      <ForgeHeader {...defaults} {...props} />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  if (!Element.prototype.animate) {
    Element.prototype.animate = function () {
      return { finished: Promise.resolve(), cancel: () => {}, onfinish: null } as unknown as Animation;
    };
  }
});

describe('ForgeHeader timer visibility', () => {
  it('renders timer when timerDurationMs and onTimerExpire are provided', () => {
    renderHeader({ timerDurationMs: 60_000, onTimerExpire: vi.fn() });
    expect(screen.queryByTestId('timer')).not.toBeNull();
  });

  it('hides timer when timerDurationMs is undefined (run mode)', () => {
    renderHeader({ timerDurationMs: undefined, onTimerExpire: undefined });
    expect(screen.queryByTestId('timer')).toBeNull();
  });

  it('hides timer when only onTimerExpire is missing', () => {
    renderHeader({ timerDurationMs: 60_000, onTimerExpire: undefined });
    expect(screen.queryByTestId('timer')).toBeNull();
  });
});
