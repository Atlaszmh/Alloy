import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Chains } from '@alloy/engine';
import { ItemSockets } from '../ItemSockets';

describe('ItemSockets (the item sheet)', () => {
  it('lists each move with an open socket and its runes, read-only', () => {
    const chains: Partial<Chains> = {
      basic: [
        { kind: 'light', element: 'fire' },
        { kind: 'heavy', element: 'fire', runes: [{ id: 'linger', tier: 1 }] },
      ],
      primary: {
        moves: [
          {
            kind: 'medium',
            form: 'bolt',
            elements: ['fire'],
            runes: [{ id: 'split', tier: 3 }, null],
          },
          { kind: 'light', form: 'bolt', elements: ['fire'] },
        ],
        payment: 'mana',
      },
    };
    render(<ItemSockets chains={chains} cap={2} />);
    expect(screen.getByTestId('item-sockets')).toHaveTextContent('Sockets · up to 2 a move');
    expect(screen.getByTestId('item-sockets-basic-1')).toHaveTextContent('Basic 2');
    expect(screen.getByTestId('item-sockets-primary-0')).toHaveTextContent('Primary 1');
    expect(screen.getByRole('img', { name: 'Socket 1: Split III' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Socket 2: empty' })).toBeInTheDocument();
    expect(screen.queryByTestId('item-sockets-basic-0')).toBeNull();
    expect(screen.queryByTestId('item-sockets-primary-1')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('with none open, says where to open them', () => {
    render(<ItemSockets chains={{ basic: [{ kind: 'light', element: 'fire' }] }} cap={1} />);
    expect(screen.getByTestId('item-sockets')).toHaveTextContent(
      'None open yet: open them in the chain builder.',
    );
  });
});
