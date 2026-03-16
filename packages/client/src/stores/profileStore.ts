import { create } from 'zustand';

interface ProfileStore {
  elo: number;
  wins: number;
  losses: number;
  matchHistory: { matchId: string; result: 'win' | 'loss' | 'draw'; eloChange: number }[];

  recordResult: (matchId: string, result: 'win' | 'loss' | 'draw', eloChange: number) => void;
  reset: () => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  elo: 1000,
  wins: 0,
  losses: 0,
  matchHistory: [],

  recordResult: (matchId, result, eloChange) =>
    set((s) => ({
      elo: s.elo + eloChange,
      wins: s.wins + (result === 'win' ? 1 : 0),
      losses: s.losses + (result === 'loss' ? 1 : 0),
      matchHistory: [...s.matchHistory, { matchId, result, eloChange }],
    })),

  reset: () => set({ elo: 1000, wins: 0, losses: 0, matchHistory: [] }),
}));
