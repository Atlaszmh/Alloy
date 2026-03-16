import { useNavigate } from 'react-router';
import { LeaderboardRow } from '@/features/meta/components/LeaderboardRow';
import { useLeaderboard } from '@/features/meta/hooks/useLeaderboard';

export function Leaderboard() {
  const navigate = useNavigate();
  const entries = useLeaderboard();

  return (
    <div className="page-enter flex h-full flex-col overflow-y-auto p-4">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-accent-400">Leaderboard</h2>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-surface-300 hover:text-white"
        >
          Back
        </button>
      </header>

      <div className="overflow-x-auto rounded-lg border border-surface-600 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-600 bg-surface-800">
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-surface-300">
                #
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-surface-300">
                Player
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-surface-300">
                Rank
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-surface-300">
                ELO
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-surface-300">
                W
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-surface-300">
                L
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <LeaderboardRow
                key={entry.id}
                position={i + 1}
                name={entry.name}
                elo={entry.elo}
                wins={entry.wins}
                losses={entry.losses}
                isCurrentPlayer={entry.isCurrentPlayer}
              />
            ))}
          </tbody>
        </table>
      </div>

      {entries.length === 0 && (
        <p className="mt-4 text-center text-sm italic text-surface-300">
          No leaderboard data available.
        </p>
      )}
    </div>
  );
}
