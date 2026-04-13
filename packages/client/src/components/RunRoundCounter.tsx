import { useRunStore, selectIsEndless } from '@/stores/runStore';

export function RunRoundCounter() {
  const round = useRunStore((s) => s.round);
  const goal = useRunStore((s) => s.goal);
  const isEndless = useRunStore(selectIsEndless);

  const progress = goal ? Math.min((round / goal) * 100, 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-xs)' }}>
      <div
        style={{
          fontFamily: 'var(--font-family-display)',
          fontSize: 'var(--text-sm)',
          fontWeight: 700,
          color: 'white',
        }}
      >
        Round {round}{isEndless ? '' : ` / ${goal}`}
      </div>

      {!isEndless && (
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: 'var(--color-surface-700)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: progress >= 100
                ? 'var(--color-success)'
                : 'var(--color-accent-400)',
              borderRadius: 2,
              transition: 'width 0.3s ease-out',
            }}
          />
        </div>
      )}
    </div>
  );
}
