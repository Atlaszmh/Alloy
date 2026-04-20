import { useEffect, useState } from 'react';

interface GoalReachedOverlayProps {
  roundReached: number;
  goalRound: number;
  onDismiss?: () => void;
}

const AUTO_DISMISS_MS = 2500;

export function GoalReachedOverlay({ roundReached, goalRound, onDismiss }: GoalReachedOverlayProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <div
      data-testid="goal-reached-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(212, 168, 52, 0.35), rgba(0, 0, 0, 0.6) 70%)',
        animation: 'fade-in 0.3s ease-out, fade-out 0.4s ease-in 2.1s forwards',
      }}
      aria-live="polite"
      aria-label={`Goal reached at round ${roundReached}`}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <p style={{ fontFamily: 'var(--font-family-display)', fontSize: 'var(--text-sm)', letterSpacing: '0.1em', color: 'var(--color-accent-400)', textTransform: 'uppercase', opacity: 0.9 }}>
          Round {roundReached} / {goalRound}
        </p>
        <h2 style={{ fontFamily: 'var(--font-family-display)', fontSize: 'clamp(2.5rem, 9vw, 5rem)', fontWeight: 900, letterSpacing: '0.08em', color: 'var(--color-accent-400)', textShadow: '0 0 32px rgba(212,168,52,0.7), 0 0 8px rgba(255,255,255,0.4)', animation: 'scale-in 0.5s cubic-bezier(0.2, 1.4, 0.3, 1) both' }}>
          GOAL REACHED
        </h2>
        <p style={{ fontFamily: 'var(--font-family-display)', fontSize: 'var(--text-md)', letterSpacing: '0.05em', color: 'var(--color-surface-100)' }}>
          You survived all {goalRound} rounds.
        </p>
      </div>
    </div>
  );
}
