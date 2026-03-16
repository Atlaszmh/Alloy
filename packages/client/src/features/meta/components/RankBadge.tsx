interface RankBadgeProps {
  elo: number;
  size?: 'sm' | 'md' | 'lg';
}

interface RankTier {
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

function getRankTier(elo: number): RankTier {
  if (elo >= 1600) return { name: 'Alloy', color: 'text-accent-400', bgColor: 'bg-accent-500/20', borderColor: 'border-accent-500' };
  if (elo >= 1400) return { name: 'Mythril', color: 'text-purple-400', bgColor: 'bg-purple-500/20', borderColor: 'border-purple-500' };
  if (elo >= 1200) return { name: 'Steel', color: 'text-blue-400', bgColor: 'bg-blue-500/20', borderColor: 'border-blue-500' };
  if (elo >= 1000) return { name: 'Iron', color: 'text-gray-300', bgColor: 'bg-gray-500/20', borderColor: 'border-gray-500' };
  return { name: 'Copper', color: 'text-orange-400', bgColor: 'bg-orange-500/20', borderColor: 'border-orange-500' };
}

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
} as const;

export function RankBadge({ elo, size = 'md' }: RankBadgeProps) {
  const tier = getRankTier(elo);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${tier.color} ${tier.bgColor} ${tier.borderColor} ${sizeClasses[size]}`}
    >
      {tier.name}
    </span>
  );
}

export { getRankTier };
export type { RankTier };
