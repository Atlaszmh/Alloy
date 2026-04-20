import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';
import { useProfileStore } from './profileStore';

// Mock the supabase module
vi.mock('@/shared/utils/supabase', () => ({
  getSupabase: vi.fn(() => null),
  isOnline: vi.fn(() => false),
}));

vi.mock('@/shared/utils/profile-api', () => ({
  fetchProfile: vi.fn(() => Promise.resolve(null)),
  updateProfileStats: vi.fn(() => Promise.resolve()),
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

describe('authStore — profile hydration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ playerId: '', displayName: '', isGuest: true, supabaseUserId: null });
    useProfileStore.getState().reset();
  });

  it('hydrateFromRemote is called with fetched stats after existing session restored', async () => {
    const { getSupabase } = await import('@/shared/utils/supabase');
    const { fetchProfile } = await import('@/shared/utils/profile-api');

    (getSupabase as any).mockReturnValue({
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: {
                id: 'user-abc',
                is_anonymous: true,
                user_metadata: {},
              },
            },
          },
        }),
      },
    });

    (fetchProfile as any).mockResolvedValue({ elo: 1200, wins: 5, losses: 2, currentStreak: 3 });

    await useAuthStore.getState().initAuth();

    const profile = useProfileStore.getState();
    expect(profile.elo).toBe(1200);
    expect(profile.wins).toBe(5);
    expect(profile.losses).toBe(2);
    expect(profile.currentStreak).toBe(3);
  });

  it('does not hydrate when fetchProfile returns null', async () => {
    const { getSupabase } = await import('@/shared/utils/supabase');
    const { fetchProfile } = await import('@/shared/utils/profile-api');

    (getSupabase as any).mockReturnValue({
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: {
                id: 'user-xyz',
                is_anonymous: false,
                user_metadata: { display_name: 'Alice' },
              },
            },
          },
        }),
      },
    });

    (fetchProfile as any).mockResolvedValue(null);

    await useAuthStore.getState().initAuth();

    // Profile store stays at defaults
    const profile = useProfileStore.getState();
    expect(profile.elo).toBe(1000);
    expect(profile.wins).toBe(0);
  });
});
