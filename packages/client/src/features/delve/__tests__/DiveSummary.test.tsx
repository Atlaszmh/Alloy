import { describe, it, expect, beforeAll, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  addMaterial,
  createDelveProfile,
  emptyHaul,
  startDive,
  type DiveState,
} from '@alloy/engine';
import { DiveSummary } from '../DiveSummary';
import { getDelveRegistry } from '../registry';

beforeAll(() => {
  // jsdom has no Web Animations; the title's entrance is cosmetic.
  if (!Element.prototype.animate)
    Element.prototype.animate = function () {
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
});

function summary(over: Partial<DiveState> = {}) {
  const registry = getDelveRegistry();
  const dive = startDive(registry, createDelveProfile(registry, 1, { primary: 'fire' }), 1).dive!;
  const props = { onCamp: vi.fn(), onAgain: vi.fn() };
  render(
    <DiveSummary
      dive={{ ...dive, phase: 'extracted', bounty: 40, settled: true, ...over }}
      biomeName="Test"
      againLabel="Again"
      {...props}
    />,
  );
  return props;
}

const rows = (id: string) =>
  within(screen.getByTestId(id))
    .getAllByTestId('haul-row')
    .map((r) => r.textContent);

describe('DiveSummary', () => {
  it('is a kit screen: the outcome, the bounty with its glyph, and the two ways on', () => {
    const { onCamp, onAgain } = summary();
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

  it('without a way straight in (the guided start goes on at the Anvil), only Return', () => {
    const registry = getDelveRegistry();
    const dive = startDive(registry, createDelveProfile(registry, 1, { primary: 'fire' }), 1).dive!;
    render(
      <DiveSummary dive={{ ...dive, phase: 'extracted' }} biomeName="Test" onCamp={vi.fn()} />,
    );
    expect(screen.getByTestId('return-camp')).toBeInTheDocument();
    expect(screen.queryByTestId('dive-again')).toBeNull();
  });

  it('a fall loses the bounty', () => {
    summary({ phase: 'dead' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('YOU FELL');
    expect(screen.getByTestId('dive-summary')).toHaveTextContent('Bounty lost: 40 scrap');
  });

  it('an abandon (settled, still at its floor or stop) counts as a death', () => {
    summary({ phase: 'choosing' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ABANDONED');
    expect(screen.getByTestId('dive-summary')).toHaveTextContent('Bounty lost: 40 scrap');
  });

  it('lists what the dive brought home, and what a death took', () => {
    const banked = {
      ...addMaterial(emptyHaul(), { kind: 'metal', metal: 'iron' }, 3),
      dust: 4,
      runes: { split: [0, 0, 1, 0, 0] },
    };
    summary({
      phase: 'dead',
      banked,
      lost: addMaterial(emptyHaul(), { kind: 'metal', metal: 'iron' }, 2),
    });
    expect(rows('dive-home')).toEqual(['Iron bar×3', 'Split III×1', 'Mana Dust×4']);
    expect(rows('dive-lost')).toEqual(['Iron bar×2']);
  });

  it('says when it brought nothing home, and shows no losses on an extract', () => {
    summary();
    expect(screen.getByTestId('dive-home')).toHaveTextContent('Brought homeNothing');
    expect(screen.queryByTestId('dive-lost')).toBeNull();
  });

  it("lists the boons the dive wore by name and count, and nothing when it wore none", () => {
    summary();
    expect(screen.queryByTestId('dive-boons')).toBeNull();
    cleanup();
    const row = (id: string) => getDelveRegistry().getBoons().find((b) => b.id === id)!;
    summary({
      phase: 'dead',
      diveBuffs: [
        { boon: 'vigor', tier: 1, effect: {} },
        { boon: 'vigor', tier: 2, effect: {} },
      ],
    });
    expect(screen.getByTestId('dive-boons')).toHaveTextContent(`Boons: ${row('vigor').name} ×2`);
  });
});
