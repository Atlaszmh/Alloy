import { useState } from 'react';
import { useRunStore } from '@/stores/runStore';

/**
 * Full-screen overlay shown when a run ends (lost all lives).
 * Renders on top of the PostMatch page. Dismissable so the player can see results.
 * For 'won' status, the PostMatch page handles the messaging directly.
 */
export function RunStatusOverlay() {
  const status = useRunStore((s) => s.status);
  const round = useRunStore((s) => s.round);
  const [dismissed, setDismissed] = useState(false);

  // Only show for lost status (run over). Won is handled by PostMatch.
  if (status !== 'lost' || dismissed) return null;

  return (
    <div
      data-testid="run-status-overlay"
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
            color: 'var(--color-danger)',
            textShadow: '0 0 40px rgba(248, 113, 113, 0.5)',
            letterSpacing: '0.08em',
          }}
        >
          Run Over
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-md)',
            fontWeight: 600,
            color: 'var(--color-surface-300)',
          }}
        >
          Eliminated after {round} {round === 1 ? 'round' : 'rounds'}.
        </p>

        <button
          onClick={() => setDismissed(true)}
          className="mt-4 rounded-lg px-8 py-3 font-bold text-white"
          style={{
            background: 'var(--color-surface-600)',
            fontFamily: 'var(--font-family-display)',
            letterSpacing: '0.04em',
          }}
        >
          VIEW RESULTS
        </button>
      </div>
    </div>
  );
}
