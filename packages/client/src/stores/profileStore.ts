import { updateProfileStats } from '@/shared/utils/profile-api';
import { useAuthStore } from './authStore';
import { createHmrStore } from './hmr-store';

interface ProfileStore {
  elo: number;
  wins: number;
  losses: number;
  currentStreak: number;
  matchHistory: { matchId: string; result: 'win' | 'loss' | 'draw'; eloChange: number }[];

  hydrateFromRemote: (stats: { elo: number; wins: number; losses: number; currentStreak: number }) => void;
  recordResult: (matchId: string, result: 'win' | 'loss' | 'draw', eloChange: number) => void;
  reset: () => void;
}

export const useProfileStore = createHmrStore<ProfileStore>('profileStore', (set) => ({
  elo: 1000,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  matchHistory: [],

  hydrateFromRemote: (stats) =>
    set({ elo: stats.elo, wins: stats.wins, losses: stats.losses, currentStreak: stats.currentStreak }),

  recordResult: (matchId, result, eloChange) => {
    set((s) => {
      const next = {
        elo: s.elo + eloChange,
        wins: s.wins + (result === 'win' ? 1 : 0),
        losses: s.losses + (result === 'loss' ? 1 : 0),
        currentStreak: result === 'win' ? s.currentStreak + 1 : 0,
        matchHistory: [...s.matchHistory, { matchId, result, eloChange }],
      };
      const auth = useAuthStore.getState();
      if (auth.supabaseUserId) {
        void updateProfileStats(auth.supabaseUserId, {
          elo: next.elo,
          wins: next.wins,
          losses: next.losses,
          currentStreak: next.currentStreak,
        });
      }
      return next;
    });
  },

  reset: () => set({ elo: 1000, wins: 0, losses: 0, currentStreak: 0, matchHistory: [] }),
}));
