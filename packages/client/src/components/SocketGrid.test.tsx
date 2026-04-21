import { render, screen } from '@testing-library/react';
import { beforeAll, describe, test, expect, vi } from 'vitest';
import { SocketGrid } from './SocketGrid';

// jsdom doesn't implement ResizeObserver; stub it so the component mounts.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof globalThis.ResizeObserver;
  }
});

describe('SocketGrid', () => {
  test('renders N empty socket buttons with data-forge-socket indices', () => {
    render(
      <SocketGrid
        cols={3}
        slots={[null, null, null, null, null, null]}
        renderFilledSocket={() => null}
        onEmptyClick={vi.fn()}
      />,
    );
    const empty = screen.getAllByRole('button');
    expect(empty).toHaveLength(6);
    expect(empty[0].getAttribute('data-forge-socket')).toBe('0');
    expect(empty[5].getAttribute('data-forge-socket')).toBe('5');
  });

  test('calls renderFilledSocket for non-null slots', () => {
    const spy = vi.fn(() => <div data-testid="filled" />);
    render(
      <SocketGrid
        cols={3}
        slots={[{ id: 'g1' }, null, null, null, null, null] as any}
        renderFilledSocket={spy}
        onEmptyClick={vi.fn()}
      />,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('filled')).not.toBeNull();
  });
});
