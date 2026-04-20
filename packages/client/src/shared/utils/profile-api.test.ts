import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProfile, updateProfileStats } from './profile-api';

vi.mock('@/shared/utils/supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from '@/shared/utils/supabase';

describe('profile-api', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('fetchProfile returns null when supabase is unavailable', async () => {
    (getSupabase as any).mockReturnValue(null);
    expect(await fetchProfile('user-id')).toBeNull();
  });

  it('fetchProfile returns the row when it exists', async () => {
    (getSupabase as any).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'user-id', elo: 1234, matches_played: 5, matches_won: 3, current_streak: 2 },
              error: null,
            }),
          }),
        }),
      }),
    });
    expect(await fetchProfile('user-id')).toEqual({ elo: 1234, wins: 3, losses: 2, currentStreak: 2 });
  });

  it('fetchProfile returns null on error and logs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (getSupabase as any).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'oops' } }),
          }),
        }),
      }),
    });
    expect(await fetchProfile('user-id')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('updateProfileStats is a no-op when supabase is unavailable', async () => {
    (getSupabase as any).mockReturnValue(null);
    await expect(updateProfileStats('user-id', { elo: 1001, wins: 1, losses: 0, currentStreak: 1 })).resolves.toBeUndefined();
  });

  it('updateProfileStats upserts the changed fields', async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    (getSupabase as any).mockReturnValue({ from: () => ({ update }) });
    await updateProfileStats('user-id', { elo: 1100, wins: 2, losses: 1, currentStreak: 1 });
    expect(update).toHaveBeenCalledWith({
      elo: 1100, matches_played: 3, matches_won: 2, current_streak: 1,
    });
  });
});
