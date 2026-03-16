interface MatchProgressBarProps {
  currentPhase: string; // 'draft' | 'forge' | 'duel' | 'result'
  currentRound: number;
  scores: [number, number];
}

const PHASES = [
  { key: 'draft', label: 'Draft' },
  { key: 'r1', label: 'R1' },
  { key: 'r2', label: 'R2' },
  { key: 'r3', label: 'R3' },
  { key: 'result', label: 'Result' },
];

function getPhaseIndex(phase: string, round: number): number {
  if (phase === 'draft') return 0;
  if (phase === 'result' || phase === 'complete') return 4;
  // forge or duel — map to round
  return round; // 1, 2, or 3
}

export function MatchProgressBar({ currentPhase, currentRound, scores }: MatchProgressBarProps) {
  const activeIndex = getPhaseIndex(currentPhase, currentRound);

  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface-800/80 px-3 py-1.5 backdrop-blur-sm"
         style={{ fontFamily: 'var(--font-family-display)' }}>
      {PHASES.map((p, i) => {
        const isActive = i === activeIndex;
        const isComplete = i < activeIndex;

        return (
          <div key={p.key} className="flex items-center">
            {i > 0 && (
              <div className={`mx-1 h-px w-3 ${isComplete ? 'bg-accent-500' : 'bg-surface-500'}`} />
            )}
            <span
              className={`text-xs font-semibold tracking-wide ${
                isActive ? 'text-accent-400' :
                isComplete ? 'text-accent-500/60' :
                'text-surface-400'
              }`}
            >
              {p.label}
            </span>
          </div>
        );
      })}

      {/* Score */}
      <div className="ml-auto flex items-center gap-1 text-xs">
        <span className="font-bold text-success">{scores[0]}</span>
        <span className="text-surface-400">-</span>
        <span className="font-bold text-danger">{scores[1]}</span>
      </div>
    </div>
  );
}
