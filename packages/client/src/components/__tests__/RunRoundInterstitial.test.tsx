// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunRoundInterstitial } from '@/components/RunRoundInterstitial';
import type { RunState } from '@alloy/engine';

function makeRunState(overrides: Partial<RunState> = {}): RunState {
  return {
    lives: 3,
    startingLives: 3,
    round: 1,
    status: 'active',
    consecutiveWins: 0,
    totalWins: 0,
    totalLosses: 0,
    goalRound: 10,
    lifeRecovery: {
      winStreak: 3,
      milestoneRounds: [5, 10],
      discoveryThreshold: 5,
    },
    flux: 0,
    rerollNextDraft: false,
    ...overrides,
  };
}

function baseProps() {
  const before = makeRunState();
  const after = makeRunState();
  return {
    roundNumber: 1,
    won: true,
    before,
    after,
    fluxEarned: { win: 0, discovery: 0, milestone: 0, total: 0 },
    discoveriesThisRound: 0,
    streakJustTriggered: false,
    milestoneJustHit: false,
    onContinue: vi.fn(),
  };
}

describe('RunRoundInterstitial', () => {
  it('renders VICTORY for won=true', () => {
    render(<RunRoundInterstitial {...baseProps()} won={true} />);
    expect(screen.getByText('VICTORY')).toBeTruthy();
  });

  it('renders DEFEAT for won=false', () => {
    render(<RunRoundInterstitial {...baseProps()} won={false} />);
    expect(screen.getByText('DEFEAT')).toBeTruthy();
  });

  it('renders life-gain callout with streak reason when streakJustTriggered', () => {
    const before = makeRunState({ lives: 2, consecutiveWins: 2 });
    const after = makeRunState({ lives: 3, consecutiveWins: 0 });
    render(
      <RunRoundInterstitial
        {...baseProps()}
        before={before}
        after={after}
        streakJustTriggered={true}
      />,
    );
    const callout = screen.getByTestId('life-gain-callout');
    expect(callout.textContent).toContain('+1 LIFE');
    expect(callout.textContent).toMatch(/streak/i);
  });

  it('renders life-gain callout with milestone reason when milestoneJustHit', () => {
    const before = makeRunState({ lives: 2, round: 5 });
    const after = makeRunState({ lives: 3, round: 5 });
    render(
      <RunRoundInterstitial
        {...baseProps()}
        roundNumber={5}
        before={before}
        after={after}
        milestoneJustHit={true}
      />,
    );
    const callout = screen.getByTestId('life-gain-callout');
    expect(callout.textContent).toContain('+1 LIFE');
    expect(callout.textContent).toMatch(/milestone/i);
  });

  it('renders streak progress when streak is active but not yet triggered', () => {
    // After winning, consecutiveWins = 2; threshold = 3, so 1 more to go
    const before = makeRunState({ consecutiveWins: 1 });
    const after = makeRunState({ consecutiveWins: 2 });
    render(
      <RunRoundInterstitial
        {...baseProps()}
        won={true}
        before={before}
        after={after}
        streakJustTriggered={false}
      />,
    );
    const progress = screen.getByTestId('streak-progress');
    expect(progress.textContent).toMatch(/2-win streak/);
    expect(progress.textContent).toMatch(/1 more for a life/);
  });

  it('does NOT render streak progress when streakJustTriggered is true', () => {
    // Recovery just fired — the life-gain callout covers it, no progress row.
    const before = makeRunState({ lives: 2, consecutiveWins: 2 });
    const after = makeRunState({ lives: 3, consecutiveWins: 0 });
    render(
      <RunRoundInterstitial
        {...baseProps()}
        won={true}
        before={before}
        after={after}
        streakJustTriggered={true}
      />,
    );
    expect(screen.queryByTestId('streak-progress')).toBeNull();
  });

  it('does NOT render flux breakdown when fluxEarned.total === 0', () => {
    render(<RunRoundInterstitial {...baseProps()} />);
    expect(screen.queryByTestId('flux-breakdown')).toBeNull();
  });

  it('renders flux breakdown when fluxEarned.total > 0', () => {
    render(
      <RunRoundInterstitial
        {...baseProps()}
        fluxEarned={{ win: 1, discovery: 0, milestone: 3, total: 4 }}
      />,
    );
    const flux = screen.getByTestId('flux-breakdown');
    expect(flux.textContent).toContain('+4 FLUX');
    expect(flux.textContent).toMatch(/win \+1/);
    expect(flux.textContent).toMatch(/milestone \+3/);
  });

  it('does NOT render discoveries-this-round when discoveriesThisRound === 0', () => {
    render(<RunRoundInterstitial {...baseProps()} />);
    expect(screen.queryByTestId('discoveries-this-round')).toBeNull();
  });

  it('renders discoveries-this-round when discoveriesThisRound > 0', () => {
    render(<RunRoundInterstitial {...baseProps()} discoveriesThisRound={2} />);
    const el = screen.getByTestId('discoveries-this-round');
    expect(el.textContent).toMatch(/2 discoveries this round/);
  });
});
