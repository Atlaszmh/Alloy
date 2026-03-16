import { useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';

export interface LeaderboardEntry {
  id: string;
  name: string;
  elo: number;
  wins: number;
  losses: number;
  isCurrentPlayer: boolean;
}

const MOCK_PLAYERS = [
  { name: 'Pyromancer', elo: 1720, wins: 84, losses: 31 },
  { name: 'IronClad', elo: 1654, wins: 72, losses: 38 },
  { name: 'FrostBite', elo: 1589, wins: 65, losses: 35 },
  { name: 'ThunderGod', elo: 1543, wins: 60, losses: 40 },
  { name: 'SteelNerve', elo: 1487, wins: 55, losses: 42 },
  { name: 'VoidWalker', elo: 1432, wins: 50, losses: 38 },
  { name: 'FlameHeart', elo: 1378, wins: 48, losses: 44 },
  { name: 'ColdSteel', elo: 1321, wins: 45, losses: 47 },
  { name: 'MythrilEdge', elo: 1265, wins: 40, losses: 42 },
  { name: 'RuneSmith', elo: 1210, wins: 38, losses: 44 },
  { name: 'DarkForge', elo: 1155, wins: 35, losses: 45 },
  { name: 'LightBender', elo: 1102, wins: 30, losses: 40 },
  { name: 'IronWill', elo: 1048, wins: 28, losses: 42 },
  { name: 'StormCaller', elo: 995, wins: 25, losses: 45 },
  { name: 'AshBorn', elo: 940, wins: 20, losses: 40 },
];

export function useLeaderboard(): LeaderboardEntry[] {
  const { playerId, displayName } = useAuthStore();
  const { elo, wins, losses } = useProfileStore();

  return useMemo(() => {
    const entries: LeaderboardEntry[] = MOCK_PLAYERS.map((p, i) => ({
      id: `mock_${i}`,
      name: p.name,
      elo: p.elo,
      wins: p.wins,
      losses: p.losses,
      isCurrentPlayer: false,
    }));

    // Insert current player if they have an id
    if (playerId) {
      entries.push({
        id: playerId,
        name: displayName || 'You',
        elo,
        wins,
        losses,
        isCurrentPlayer: true,
      });
    }

    // Sort by ELO descending
    entries.sort((a, b) => b.elo - a.elo);

    return entries;
  }, [playerId, displayName, elo, wins, losses]);
}
