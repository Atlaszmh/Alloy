import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteGateway } from './remote-gateway';

// Mock supabase
const mockRemoveChannel = vi.fn();
const mockSubscribe = vi.fn().mockReturnThis();
const mockOn = vi.fn().mockReturnThis();
const mockChannel = {
  on: mockOn,
  subscribe: mockSubscribe,
};
const mockSupabase = {
  channel: vi.fn(() => mockChannel),
  removeChannel: mockRemoveChannel,
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  },
};

vi.mock('@/shared/utils/supabase', () => ({
  getSupabase: () => mockSupabase,
}));

describe('RemoteGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct code property', () => {
    const gw = new RemoteGateway('ABCD');
    expect(gw.code).toBe('ABCD');
    gw.destroy();
  });

  it('returns null state before initialization', () => {
    const gw = new RemoteGateway('ABCD');
    expect(gw.getState()).toBeNull();
    gw.destroy();
  });

  it('destroy cleans up channel', () => {
    const gw = new RemoteGateway('ABCD');
    expect(mockSupabase.channel).toHaveBeenCalledWith('match:ABCD');

    gw.destroy();

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('subscribe and unsubscribe manage listeners', () => {
    const gw = new RemoteGateway('ABCD');
    const cb = vi.fn();

    const unsub = gw.subscribe(cb);
    expect(typeof unsub).toBe('function');

    unsub();
    gw.destroy();
  });

  it('onEvent and unsubscribe manage listeners', () => {
    const gw = new RemoteGateway('ABCD');
    const cb = vi.fn();

    const unsub = gw.onEvent(cb);
    expect(typeof unsub).toBe('function');

    unsub();
    gw.destroy();
  });

  it('dispatch returns error for unsupported action kinds', async () => {
    const gw = new RemoteGateway('ABCD');
    const result = await gw.dispatch({ kind: 'some_unknown_action' } as any);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unsupported action kind');
    }
    gw.destroy();
  });
});
