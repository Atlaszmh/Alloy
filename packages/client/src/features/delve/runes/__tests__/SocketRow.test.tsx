import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocketRow } from '../SocketRow';

describe('SocketRow', () => {
  it('shows each open socket, its rune or empty, and "+ socket" with the next price', () => {
    const onOpenSocket = vi.fn();
    const onSocketTap = vi.fn();
    render(
      <SocketRow
        runes={[{ id: 'split', tier: 3 }, null]}
        cap={3}
        nextPrice={{ links: 3, scrap: 60 }}
        onOpenSocket={onOpenSocket}
        onSocketTap={onSocketTap}
      />,
    );
    expect(screen.getByRole('button', { name: 'Socket 1: Split III' })).toBeInTheDocument();
    expect(screen.getByTestId('socket-0')).toHaveAttribute('data-rune', 'split:3');
    expect(screen.getByTestId('socket-1')).not.toHaveAttribute('data-rune');
    fireEvent.click(screen.getByRole('button', { name: 'Socket 2: empty' }));
    expect(onSocketTap).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('socket-open')).toHaveTextContent('+ socket · 🔗 3 · ⚙ 60');
    fireEvent.click(screen.getByTestId('socket-open'));
    expect(onOpenSocket).toHaveBeenCalledOnce();
  });

  it('hides "+ socket" at the cap or with no price, and shows a free one bare', () => {
    const { rerender } = render(
      <SocketRow runes={[null, null]} cap={2} nextPrice={{ links: 3, scrap: 60 }} />,
    );
    expect(screen.queryByTestId('socket-open')).toBeNull();
    rerender(<SocketRow runes={[null]} cap={2} nextPrice={null} />);
    expect(screen.queryByTestId('socket-open')).toBeNull();
    rerender(<SocketRow runes={[]} cap={3} nextPrice={{ links: 0, scrap: 0 }} />);
    expect(screen.getByTestId('socket-open').textContent).toBe('+ socket');
  });

  it('a dormant rune is dimmed and says why', () => {
    render(
      <SocketRow
        runes={[{ id: 'linger', tier: 2 }]}
        cap={1}
        nextPrice={null}
        dormant={[0]}
        onSocketTap={() => {}}
      />,
    );
    const pip = screen.getByRole('button', {
      name: 'Socket 1: Linger II, dormant: works on heavy and hold blows',
    });
    expect(pip).toHaveAttribute('title', 'Works on heavy and hold blows');
    expect(screen.getByRole('img', { name: 'Linger II, dormant' })).toHaveStyle({ opacity: '0.4' });
  });

  it('locked, the pips are marks, not buttons, and nothing opens', () => {
    render(
      <SocketRow
        runes={[{ id: 'split', tier: 1 }, null]}
        cap={3}
        nextPrice={{ links: 3, scrap: 60 }}
        locked
        onSocketTap={() => {}}
        onOpenSocket={() => {}}
      />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('img', { name: 'Socket 1: Split I' })).toBeInTheDocument();
    expect(screen.getByTestId('socket-0')).toHaveAttribute('data-rune', 'split:1');
    expect(screen.getByRole('img', { name: 'Socket 2: empty' })).toBeInTheDocument();
  });

  it('emptyOnly (a stop rune pick), only the empty sockets are buttons: filled ones are marks', () => {
    const onSocketTap = vi.fn();
    render(
      <SocketRow
        runes={[{ id: 'split', tier: 1 }, null]}
        cap={2}
        nextPrice={null}
        emptyOnly
        onSocketTap={onSocketTap}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Socket 1: Split I' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Socket 2: empty' }));
    expect(onSocketTap).toHaveBeenCalledWith(1);
  });

  it('a move with no socket and none to open shows nothing', () => {
    const { container } = render(<SocketRow runes={[]} cap={0} nextPrice={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
