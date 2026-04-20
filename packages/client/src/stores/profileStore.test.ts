import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProfileStore } from './profileStore';

vi.mock('@/shared/utils/supabase', () => ({
  getSupabase: vi.fn(() => null),
  isOnline: vi.fn(() => false),
}));

vi.mock('@/shared/utils/profile-api', () => ({
  fetchProfile: vi.fn(),
  updateProfileStats: vi.fn(),
}));

import { updateProfileStats } from '@/shared/utils/profile-api';
import { useAuthStore } from '@/stores/authStore';

describe('profileStore — initial state', () => {
  it('starts with default elo and zero counters', () => {
    const s = useProfileStore.getState();
    expect(s.elo).toBe(1000);
    expect(s.wins).toBe(0);
    expect(s.losses).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.matchHistory).toHaveLength(0);
  });
});

describe('profileStore — hydrateFromRemote', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('overwrites all stats from remote data', () => {
    useProfileStore.getState().hydrateFromRemote({ elo: 1350, wins: 10, losses: 3, currentStreak: 4 });
    const s = useProfileStore.getState();
    expect(s.elo).toBe(1350);
    expect(s.wins).toBe(10);
    expect(s.losses).toBe(3);
    expect(s.currentStreak).toBe(4);
  });
});

describe('profileStore — recordResult basics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useProfileStore.getState().reset();
    useAuthStore.setState({ playerId: 'guest_x', supabaseUserId: null, isGuest: true, displayName: 'G' });
  });

  it('records a win correctly', () => {
    useProfileStore.getState().recordResult('m1', 'win', +25);
    const s = useProfileStore.getState();
    expect(s.elo).toBe(1025);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(0);
    expect(s.currentStreak).toBe(1);
    expect(s.matchHistory).toHaveLength(1);
    expect(s.matchHistory[0]).toEqual({ matchId: 'm1', result: 'win', eloChange: 25 });
  });

  it('records a loss and resets streak', () => {
    useProfileStore.getState().recordResult('m1', 'win', +25);
    useProfileStore.getState().recordResult('m2', 'loss', -15);
    const s = useProfileStore.getState();
    expect(s.elo).toBe(1010);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.currentStreak).toBe(0);
  });

  it('increments streak on consecutive wins', () => {
    useProfileStore.getState().recordResult('m1', 'win', +10);
    useProfileStore.getState().recordResult('m2', 'win', +10);
    useProfileStore.getState().recordResult('m3', 'win', +10);
    expect(useProfileStore.getState().currentStreak).toBe(3);
  });

  it('draw does not count as win or loss and resets streak', () => {
    useProfileStore.getState().recordResult('m1', 'win', +10);
    useProfileStore.getState().recordResult('m2', 'draw', 0);
    const s = useProfileStore.getState();
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(0);
    expect(s.currentStreak).toBe(0);
  });
});

describe('profileStore — write-through on recordResult', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useProfileStore.getState().reset();
    useAuthStore.setState({ playerId: 'user-1', supabaseUserId: 'user-1', isGuest: true, displayName: 'P' });
  });

  it('calls updateProfileStats with the new totals when a match is recorded', async () => {
    useProfileStore.getState().recordResult('m1', 'win', +25);
    await Promise.resolve();
    expect(updateProfileStats).toHaveBeenCalledWith('user-1', { elo: 1025, wins: 1, losses: 0, currentStreak: 1 });
  });

  it('does NOT call updateProfileStats when supabaseUserId is null (guest fallback)', async () => {
    useAuthStore.setState({ playerId: 'guest_x', supabaseUserId: null, isGuest: true, displayName: 'G' });
    useProfileStore.getState().recordResult('m1', 'win', +25);
    await Promise.resolve();
    expect(updateProfileStats).not.toHaveBeenCalled();
  });

  it('calls updateProfileStats for authenticated non-guest users too', async () => {
    useAuthStore.setState({ playerId: 'user-2', supabaseUserId: 'user-2', isGuest: false, displayName: 'Q' });
    useProfileStore.getState().recordResult('m1', 'loss', -20);
    await Promise.resolve();
    expect(updateProfileStats).toHaveBeenCalledWith('user-2', { elo: 980, wins: 0, losses: 1, currentStreak: 0 });
  });
});

describe('profileStore — reset', () => {
  it('resets all fields to defaults', () => {
    useProfileStore.getState().hydrateFromRemote({ elo: 1500, wins: 20, losses: 5, currentStreak: 7 });
    useProfileStore.getState().reset();
    const s = useProfileStore.getState();
    expect(s.elo).toBe(1000);
    expect(s.wins).toBe(0);
    expect(s.losses).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.matchHistory).toHaveLength(0);
  });
});
