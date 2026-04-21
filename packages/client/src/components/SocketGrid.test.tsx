import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { SocketGrid } from './SocketGrid';

// ResizeObserver is stubbed centrally in src/test-setup.ts

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
