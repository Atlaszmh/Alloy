import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RARITY_TEXT } from '../../format';
import { BOON_STYLE } from '../boon-style';
import { BoonCard } from '../BoonCards';

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
