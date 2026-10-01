import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createDelveProfile, startDive } from '@alloy/engine';
import { DiveSummary } from '../DiveSummary';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

beforeAll(() => {
  // jsdom has no Web Animations; the title's entrance is cosmetic.
  if (!Element.prototype.animate)
    Element.prototype.animate = function () {
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
});

function summary(dustEarned: number, linksEarned = 0, runesEarned = 0) {
  const registry = getDelveRegistry();
  const dive = startDive(registry, createDelveProfile(registry, 1, { primary: 'fire' }), 1).dive!;
  const noop = () => {};
  render(
    <DiveSummary
      dive={{ ...dive, phase: 'extracted', dustEarned, linksEarned, runesEarned }}
      biomeName="Test"
      onCamp={noop}
      onAgain={noop}
      againLabel="Again"
    />,
  );
}

describe('DiveSummary', () => {
  it('shows the Mana Dust salvage gave this dive', () => {
    summary(7);
    expect(screen.getByTestId('dive-dust')).toHaveTextContent('✦ 7 Mana Dust from salvage');
  });

  it('says nothing about Mana Dust or Links when there were none', () => {
    summary(0);
    expect(screen.queryByTestId('dive-dust')).toBeNull();
    expect(screen.queryByTestId('dive-links')).toBeNull();
  });

  it('shows the Links salvaged weapons gave this dive', () => {
    summary(0, 2);
    expect(screen.getByTestId('dive-links')).toHaveTextContent('🔗 2 Links from salvaged weapons');
    expect(screen.queryByTestId('dive-runes')).toBeNull();
  });

  it('counts the runes found this dive, and names them', () => {
    useDelveStore.getState().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    summary(0, 0, 2);
    expect(screen.getByTestId('dive-runes')).toHaveTextContent(
      '◈ 2 runes found: Quick I, Split III',
    );
  });
});
