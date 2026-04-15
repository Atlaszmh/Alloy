import { useRunStore } from '@/stores/runStore';

interface RunRoundInterstitialProps {
  roundNumber: number;
  won: boolean;
  onContinue: () => void;
}

export function RunRoundInterstitial({ roundNumber, won, onContinue }: RunRoundInterstitialProps) {
  const storeLives = useRunStore((s) => s.lives);

  // Compute expected lives after this round's result is applied.
  // The engine hasn't processed duel_continue yet, so storeLives is stale.
  // On loss: lives - 1. On win: no change (streak recovery not shown here).
  const lives = won ? storeLives : Math.max(0, storeLives - 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
        animation: 'fade-in 0.3s ease-out',
      }}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        {/* Round result */}
        <p
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-sm)',
            letterSpacing: '0.08em',
            color: 'var(--color-surface-400)',
            textTransform: 'uppercase',
          }}
        >
          Round {roundNumber}
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'clamp(1.5rem, 6vw, 2.5rem)',
            fontWeight: 900,
            letterSpacing: '0.06em',
            color: won ? 'var(--color-success)' : 'var(--color-danger)',
            textShadow: won
              ? '0 0 24px rgba(74, 222, 128, 0.4)'
              : '0 0 24px rgba(248, 113, 113, 0.4)',
          }}
        >
          {won ? 'VICTORY' : 'DEFEAT'}
        </h2>

        {/* Lives display */}
        <div className="flex items-center gap-2">
          {Array.from({ length: Math.max(lives, 5) }, (_, i) => (
            <span
              key={i}
              style={{
                fontSize: 'var(--text-lg)',
                color: i < lives ? 'var(--color-danger)' : 'var(--color-surface-600)',
                textShadow: i < lives ? '0 0 8px var(--color-danger)' : undefined,
                transition: 'color 0.3s, text-shadow 0.3s',
              }}
            >
              {'\u2764'}
            </span>
          ))}
        </div>
        <p
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-surface-400)',
          }}
        >
          {won ? 'Onward!' : lives === 0 ? 'No lives remaining...' : `${lives} ${lives === 1 ? 'life' : 'lives'} remaining`}
        </p>

        {/* Continue button */}
        <button
          onClick={onContinue}
          className="mt-4 rounded-lg px-8 py-3 font-bold text-surface-900"
          style={{
            background: won
              ? 'linear-gradient(to bottom, var(--color-success), var(--color-success-dark, #16a34a))'
              : 'linear-gradient(to bottom, var(--color-accent-400), var(--color-accent-500))',
            fontFamily: 'var(--font-family-display)',
            letterSpacing: '0.04em',
            boxShadow: 'var(--shadow-button)',
          }}
        >
          {lives === 0 ? 'SEE RESULTS' : 'CONTINUE'}
        </button>
      </div>
    </div>
  );
}
