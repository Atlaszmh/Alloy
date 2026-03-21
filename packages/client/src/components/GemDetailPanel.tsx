interface GemDetailPanelProps {
  affixName: string;
  description: string;
  category: string;
  tags: string[];
  statLabel: string;
  tier: number;
}

export function GemDetailPanel({ affixName, description, category, tags, statLabel, tier }: GemDetailPanelProps) {
  return (
    <div className="flex flex-col gap-1.5 max-w-[220px]">
      <div className="flex items-center justify-between">
        <span className="font-bold text-white text-sm" style={{ fontFamily: 'var(--font-family-display)' }}>
          {affixName}
        </span>
        <span className="text-xs font-bold text-accent-300">{statLabel}</span>
      </div>
      <p className="text-xs text-surface-300 leading-snug">{description}</p>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-surface-600 px-2 py-0.5 text-[10px] font-semibold text-surface-200"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-surface-400">
        <span>{category}</span>
        <span>Tier {tier}</span>
      </div>
    </div>
  );
}
