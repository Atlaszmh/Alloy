import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDelveStore } from '@/stores/delveStore';
import { useDelveNotices } from '../useDelveNotices';

describe('useDelveNotices', () => {
  beforeEach(() => useDelveStore.setState({ notices: ['Storm now outweighs Fire'] }));

  it('takes the notices when enabled', () => {
    renderHook(() => useDelveNotices());
    expect(useDelveStore.getState().notices).toEqual([]);
  });

  it('leaves them in the store while disabled (a page with no toasts to show them)', () => {
    renderHook(() => useDelveNotices(false));
    expect(useDelveStore.getState().notices).toEqual(['Storm now outweighs Fire']);
  });
});
