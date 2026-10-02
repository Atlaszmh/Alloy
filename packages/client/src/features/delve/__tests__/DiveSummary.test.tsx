import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

function summary(
  dustEarned: number,
  linksEarned = 0,
  runesEarned = 0,
  phase: 'extracted' | 'dead' = 'extracted',
) {
  const registry = getDelveRegistry();
  const dive = startDive(registry, createDelveProfile(registry, 1, { primary: 'fire' }), 1).dive!;
  const props = { onCamp: vi.fn(), onAgain: vi.fn() };
  render(
    <DiveSummary
      dive={{ ...dive, phase, bounty: 40, dustEarned, linksEarned, runesEarned }}
      biomeName="Test"
      againLabel="Again"
      {...props}
    />,
  );
  return props;
}

describe('DiveSummary', () => {
  it('is a kit screen: the outcome, the bounty with its glyph, and the two ways on', () => {
    const { onCamp, onAgain } = summary(3, 1);
    const root = screen.getByTestId('dive-summary');
    expect(root).toHaveClass('delve-ui', 'delve-zoom');
    expect(root).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('EXTRACTED');
    expect(root).toHaveTextContent('Bounty claimed: 40 scrap');
    expect(root.querySelector('[data-glyph="scrap"]')).not.toBeNull();
    // Glyphs, not emoji.
    expect(root.textContent).not.toMatch(/[⚙✦◈]|🔗/u);
    fireEvent.click(screen.getByTestId('return-camp'));
    expect(onCamp).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('dive-again'));
    expect(onAgain).toHaveBeenCalledOnce();
  });

  it('a fall loses the bounty', () => {
    summary(0, 0, 0, 'dead');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('YOU FELL');
    expect(screen.getByTestId('dive-summary')).toHaveTextContent('Bounty lost: 40 scrap');
  });

  it('shows the Mana Dust salvage gave this dive', () => {
    summary(7);
    expect(screen.getByTestId('dive-dust')).toHaveTextContent('7 Mana Dust from salvage');
  });

  it('says nothing about Mana Dust or Links when there were none', () => {
    summary(0);
    expect(screen.queryByTestId('dive-dust')).toBeNull();
    expect(screen.queryByTestId('dive-links')).toBeNull();
  });

  it('shows the Links salvaged weapons gave this dive', () => {
    summary(0, 2);
    expect(screen.getByTestId('dive-links')).toHaveTextContent('2 Links from salvaged weapons');
    expect(screen.queryByTestId('dive-runes')).toBeNull();
  });

  it('counts the runes found this dive, and names them', () => {
    useDelveStore.getState().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    summary(0, 0, 2);
    expect(screen.getByTestId('dive-runes')).toHaveTextContent('2 runes found: Quick I, Split III');
  });
});
