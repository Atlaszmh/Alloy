import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { BoonStop, Buff, ProfileActionResult, StopAction } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useUIStore } from '@/stores/uiStore';
import { getDelveRegistry } from '../../registry';
import { RARITY_TEXT } from '../../format';
import { BOON_STYLE } from '../boon-style';
import { BoonCard, BoonCards } from '../BoonCards';

const registry = getDelveRegistry();
const realTake = useDelveStore.getState().takeStop;
/** The store's take, stubbed: Phase A's engine refuses every boon take. */
const stubTake = (result: Partial<ProfileActionResult>) => {
  const take = vi.fn(
    (_: StopAction): ProfileActionResult => ({
      ok: true,
      profile: useDelveStore.getState().profile,
      ...result,
    }),
  );
  useDelveStore.setState({ takeStop: take });
  return take;
};
const STOP: BoonStop = {
  kind: 'boons',
  offers: [
    { id: 'vigor', tier: 1 },
    { id: 'renewal', tier: 2 },
    { id: 'clarity', tier: 3 },
  ],
  taken: false,
};
const worn = (id: string, tier: 1 | 2 | 3): Buff => ({
  boon: id,
  tier,
  effect: registry.getBoon(id)!.tiers[tier - 1].effect,
});

// The boons spec, 6: a card's family edge, its tier mark, the name, the tier's line, the taken count.

describe('a boon card', () => {
  it('shows its family on its edge, its tier mark in the tier colour, the name and the line', () => {
    const onTake = vi.fn();
    render(
      <BoonCard
        id="glass-cannon"
        family="pact"
        tier={3}
        name="Glass Cannon"
        text="+45% damage, −20% max life"
        count={0}
        cap={2}
        first
        onTake={onTake}
      />,
    );
    const card = screen.getByTestId('boon-card');
    expect(card.tagName).toBe('BUTTON');
    expect(card).toHaveAttribute('data-boon', 'glass-cannon');
    expect(card).toHaveAttribute('data-family', 'pact');
    expect(card).toHaveAttribute('data-tier', '3');
    expect(card).toHaveAttribute('data-pad-first');
    expect(card.querySelector<HTMLElement>('[data-boon-edge]')!.style.background).toBe(
      'rgb(162, 38, 51)', // #a22633
    );
    expect(BOON_STYLE.pact.color).toBe('#a22633');
    const mark = card.querySelector<HTMLElement>('[data-boon-tier]')!;
    expect(mark).toHaveTextContent('III');
    expect(mark.style.color).toBe('rgb(215, 166, 232)'); // RARITY_TEXT.epic
    expect(RARITY_TEXT.epic).toBe('#d7a6e8');
    expect(card).toHaveTextContent('Pact');
    expect(card).toHaveTextContent('Glass Cannon');
    expect(card).toHaveTextContent('+45% damage, −20% max life');
    expect(screen.queryByTestId('boon-taken')).toBeNull();
    fireEvent.click(card);
    expect(onTake).toHaveBeenCalledOnce();
  });

  it('says how many of it are worn, against its cap, once one is', () => {
    render(
      <BoonCard
        id="keen-edge"
        family="offense"
        tier={1}
        name="Keen Edge"
        text="+10% damage"
        count={2}
        cap={3}
        onTake={() => {}}
      />,
    );
    expect(screen.getByTestId('boon-taken')).toHaveTextContent('Taken 2 of 3');
    expect(screen.getByTestId('boon-card')).not.toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('boon-card').querySelector('[data-boon-tier]')).toHaveTextContent(
      'I',
    );
  });
});

describe("a stop's boon cards", () => {
  afterEach(() => {
    useDelveStore.setState({ takeStop: realTake });
    vi.restoreAllMocks();
  });

  it('shows each offer as a card from the data, in order, the first the first focus, and counts what is worn', () => {
    const real = registry.getBoon.bind(registry);
    vi.spyOn(registry, 'getBoon').mockImplementation((id) => ({ ...real(id)!, cap: 3 }));
    render(
      <BoonCards stop={STOP} worn={[worn('renewal', 1), worn('renewal', 2), worn('vigor', 1)]} />,
    );
    const step = screen.getByTestId('stop-boon');
    expect(step).toHaveTextContent('Take one boon');
    const cards = within(step).getAllByTestId('boon-card');
    expect(cards.map((c) => [c.dataset.boon, c.dataset.family, c.dataset.tier])).toEqual(
      STOP.offers.map((o) => [o.id, registry.getBoon(o.id)!.family, String(o.tier)]),
    );
    STOP.offers.forEach((o, i) => {
      const def = registry.getBoon(o.id)!;
      expect(cards[i]).toHaveTextContent(def.name);
      expect(cards[i]).toHaveTextContent(def.tiers[o.tier - 1].text);
    });
    expect(cards.map((c) => c.hasAttribute('data-pad-first'))).toEqual([true, false, false]);
    expect(cards.map((c) => within(c).queryByTestId('boon-taken')?.textContent ?? null)).toEqual([
      'Taken 1 of 3',
      'Taken 2 of 3',
      null,
    ]);
  });

  it('a click takes that boon through the store, and marks the stop hint seen', () => {
    useUIStore.setState({ seen: [] });
    const take = stubTake({});
    render(<BoonCards stop={STOP} worn={[]} />);
    fireEvent.click(screen.getAllByTestId('boon-card')[1]);
    expect(take).toHaveBeenCalledWith({ kind: 'boon', index: 1 });
    expect(useUIStore.getState().seen).toContain('stop');
    expect(screen.queryByTestId('boon-refused')).toBeNull();
  });

  it("a refused take says the engine's reason and marks nothing", () => {
    useUIStore.setState({ seen: [] });
    stubTake({ ok: false, reason: 'Not offered at this stop' });
    render(<BoonCards stop={STOP} worn={[]} />);
    fireEvent.click(screen.getAllByTestId('boon-card')[0]);
    expect(screen.getByTestId('boon-refused')).toHaveTextContent('Not offered at this stop');
    expect(useUIStore.getState().seen).not.toContain('stop');
  });
});
