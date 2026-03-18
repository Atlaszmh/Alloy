import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMatchGateway } from './use-match-gateway';
import { LocalGateway } from './local-gateway';

describe('useMatchGateway', () => {
  it('returns LocalGateway for ai- prefixed codes', () => {
    const { result, unmount } = renderHook(() => useMatchGateway('ai-test-1'));
    expect(result.current).toBeInstanceOf(LocalGateway);
    expect(result.current.code).toBe('ai-test-1');
    unmount();
  });

  it('returns same instance across re-renders', () => {
    const { result, rerender, unmount } = renderHook(() => useMatchGateway('ai-test-2'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    unmount();
  });

  it('creates new instance when code changes', () => {
    const { result, rerender, unmount } = renderHook(
      ({ code }) => useMatchGateway(code),
      { initialProps: { code: 'ai-match-1' } },
    );
    const first = result.current;
    expect(first.code).toBe('ai-match-1');

    rerender({ code: 'ai-match-2' });
    const second = result.current;
    expect(second.code).toBe('ai-match-2');
    expect(second).not.toBe(first);
    unmount();
  });

  it('throws for non-ai codes', () => {
    expect(() => {
      renderHook(() => useMatchGateway('pvp-match-1'));
    }).toThrow('RemoteGateway not yet implemented');
  });
});
