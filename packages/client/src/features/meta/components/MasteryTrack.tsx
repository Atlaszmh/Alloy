interface MasteryTrackProps {
  name: string;
  level: number;
  currentXP: number;
  requiredXP: number;
  color?: string;
}

export function MasteryTrack({
  name,
  level,
  currentXP,
  requiredXP,
  color = 'bg-accent-500',
}: MasteryTrackProps) {
  const fillPercent = Math.min((currentXP / requiredXP) * 100, 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-white">{name}</span>
        <span className="text-surface-400">
          Lv. {level} — {currentXP}/{requiredXP} XP
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-700">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
    </div>
  );
}
