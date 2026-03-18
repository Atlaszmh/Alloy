import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';

// Mock the supabase module
vi.mock('@/shared/utils/supabase', () => ({
  getSupabase: vi.fn(() => null),
  isOnline: vi.fn(() => false),
}));

describe('authStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.setState({
      playerId: '',
      displayName: '',
      isGuest: true,
      supabaseUserId: null,
    });
  });

  it('loginAsGuest sets a guest player ID', () => {
    useAuthStore.getState().loginAsGuest();

    const state = useAuthStore.getState();
    expect(state.playerId).toMatch(/^guest_\d+$/);
    expect(state.displayName).toBe('Guest');
    expect(state.isGuest).toBe(true);
    expect(state.supabaseUserId).toBeNull();
  });

  it('setPlayer updates state', () => {
    useAuthStore.getState().setPlayer('player-123', 'Alice', false);

    const state = useAuthStore.getState();
    expect(state.playerId).toBe('player-123');
    expect(state.displayName).toBe('Alice');
    expect(state.isGuest).toBe(false);
  });

  it('initAuth falls back to guest when offline (getSupabase returns null)', async () => {
    await useAuthStore.getState().initAuth();

    const state = useAuthStore.getState();
    expect(state.playerId).toMatch(/^guest_\d+$/);
    expect(state.displayName).toBe('Guest');
    expect(state.isGuest).toBe(true);
    expect(state.supabaseUserId).toBeNull();
  });
});
