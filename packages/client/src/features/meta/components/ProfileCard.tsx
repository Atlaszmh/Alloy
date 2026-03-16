import { RankBadge } from './RankBadge';

interface ProfileCardProps {
  displayName: string;
  elo: number;
  wins: number;
  losses: number;
}

export function ProfileCard({ displayName, elo, wins, losses }: ProfileCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-surface-600 bg-surface-800 p-4">
      {/* Avatar placeholder */}
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-600 text-lg font-bold text-accent-400">
        {displayName.charAt(0).toUpperCase()}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{displayName}</span>
          <RankBadge elo={elo} size="sm" />
        </div>
        <div className="flex items-center gap-3 text-sm text-surface-400">
          <span>{elo} ELO</span>
          <span className="text-green-400">{wins}W</span>
          <span className="text-red-400">{losses}L</span>
        </div>
      </div>
    </div>
  );
}
