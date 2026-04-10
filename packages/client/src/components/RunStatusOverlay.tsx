import { useRunStore } from '@/stores/runStore';

export function RunStatusOverlay() {
  const status = useRunStore((s) => s.status);
  const round = useRunStore((s) => s.round);

  if (status === 'active') return null;

  const isWon = status === 'won';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--gap-lg)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'clamp(2rem, 8vw, 4rem)',
            fontWeight: 900,
            color: isWon ? 'var(--color-accent-400)' : 'var(--color-danger)',
            textShadow: isWon
              ? '0 0 40px rgba(212, 168, 52, 0.7)'
              : '0 0 40px rgba(248, 113, 113, 0.5)',
            letterSpacing: '0.08em',
          }}
        >
          {isWon ? 'Run Won!' : 'Run Over'}
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-md)',
            fontWeight: 600,
            color: 'var(--color-surface-300)',
          }}
        >
          {isWon
            ? `Goal reached at Round ${round}!`
            : `Eliminated after ${round} ${round === 1 ? 'round' : 'rounds'}.`}
        </p>
      </div>
    </div>
  );
}
