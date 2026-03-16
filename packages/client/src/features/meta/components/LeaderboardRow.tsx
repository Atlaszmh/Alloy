import { RankBadge, getRankTier } from './RankBadge';

interface LeaderboardRowProps {
  position: number;
  name: string;
  elo: number;
  wins: number;
  losses: number;
  isCurrentPlayer?: boolean;
}

/** Tier-based row tinting */
function getTierRowBg(elo: number): string {
  const tier = getRankTier(elo);
  switch (tier.name) {
    case 'Alloy':
      return 'bg-amber-500/5';
    case 'Mythril':
      return 'bg-purple-500/5';
    case 'Steel':
      return 'bg-teal-500/5';
    case 'Iron':
      return 'bg-surface-700';
    case 'Copper':
      return 'bg-surface-800';
    default:
      return 'bg-surface-800';
  }
}

/** Top 3 left border colors */
function getTopBorderClass(position: number): string {
  if (position === 1) return 'border-l-4 border-l-yellow-400';
  if (position === 2) return 'border-l-4 border-l-gray-300';
  if (position === 3) return 'border-l-4 border-l-orange-400';
  return '';
}

export function LeaderboardRow({
  position,
  name,
  elo,
  wins,
  losses,
  isCurrentPlayer = false,
}: LeaderboardRowProps) {
  const tierBg = isCurrentPlayer ? 'bg-accent-500/10' : getTierRowBg(elo);
  const topBorder = getTopBorderClass(position);
  const rowBorder = isCurrentPlayer ? 'border-accent-500/30' : 'border-surface-700';

  return (
    <tr
      className={`border-b transition-all hover:translate-x-0.5 hover:brightness-110 ${tierBg} ${rowBorder} ${topBorder}`}
      style={{ animationDelay: `${position * 30}ms`, animationFillMode: 'both' }}
    >
      <td className="px-3 py-2 text-center">
        <span className={`stat-number text-sm ${
          position === 1 ? 'text-yellow-400' : position === 2 ? 'text-gray-300' : position === 3 ? 'text-orange-400' : 'text-surface-300'
        }`}>
          #{position}
        </span>
      </td>
      <td className="px-3 py-2 text-sm">
        <span className={`font-semibold ${isCurrentPlayer ? 'text-accent-400' : 'text-white'}`}>
          {name}
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        <RankBadge elo={elo} size="sm" />
      </td>
      <td className="px-3 py-2 text-center">
        <span className="stat-number text-sm text-white">{elo}</span>
      </td>
      <td className="px-3 py-2 text-center text-sm text-green-400">{wins}</td>
      <td className="px-3 py-2 text-center text-sm text-red-400">{losses}</td>
    </tr>
  );
}
