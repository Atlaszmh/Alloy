import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';

export interface ProfileData {
  playerId: string;
  displayName: string;
  isGuest: boolean;
  elo: number;
  wins: number;
  losses: number;
  matchHistory: { matchId: string; result: 'win' | 'loss' | 'draw'; eloChange: number }[];
  winRate: number;
}

export function useProfile(): ProfileData {
  const { playerId, displayName, isGuest } = useAuthStore();
  const { elo, wins, losses, matchHistory } = useProfileStore();

  const totalGames = wins + losses;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  return {
    playerId,
    displayName: displayName || 'Unknown Player',
    isGuest,
    elo,
    wins,
    losses,
    matchHistory,
    winRate,
  };
}
