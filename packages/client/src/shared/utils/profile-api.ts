import { getSupabase } from '@/shared/utils/supabase';

export interface ProfileStats {
  elo: number;
  wins: number;
  losses: number;
  currentStreak: number;
}

export async function fetchProfile(userId: string): Promise<ProfileStats | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('elo, matches_played, matches_won, current_streak')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn('[profile-api] fetchProfile failed:', error.message);
    return null;
  }

  return {
    elo: data.elo,
    wins: data.matches_won,
    losses: data.matches_played - data.matches_won,
    currentStreak: data.current_streak,
  };
}

export async function updateProfileStats(userId: string, stats: ProfileStats): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from('profiles')
    .update({
      elo: stats.elo,
      matches_played: stats.wins + stats.losses,
      matches_won: stats.wins,
      current_streak: stats.currentStreak,
    })
    .eq('id', userId);

  if (error) console.warn('[profile-api] updateProfileStats failed:', error.message);
}
