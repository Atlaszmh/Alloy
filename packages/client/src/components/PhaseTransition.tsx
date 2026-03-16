import { useEffect, useState } from 'react';

interface PhaseTransitionProps {
  phase: string | null; // e.g., "DRAFT", "ROUND 1 — FORGE", "ROUND 1 — FIGHT!"
  onComplete?: () => void;
}

export function PhaseTransition({ phase, onComplete }: PhaseTransitionProps) {
  const [visible, setVisible] = useState(false);
  const [displayPhase, setDisplayPhase] = useState<string | null>(null);

  useEffect(() => {
    if (!phase) return;
    setDisplayPhase(phase);
    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 1200);

    return () => clearTimeout(timer);
  }, [phase, onComplete]);

  if (!visible || !displayPhase) return null;

  const isVictory = displayPhase.includes('VICTORY');
  const isDefeat = displayPhase.includes('DEFEAT');
  const isFight = displayPhase.includes('FIGHT');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="text-center"
        style={{ animation: 'phase-title 1.2s ease-out forwards' }}
      >
        <h1
          className="text-display-xl font-bold tracking-widest"
          style={{
            fontFamily: 'var(--font-family-display)',
            color: isVictory ? 'var(--color-accent-400)' :
                   isDefeat ? 'var(--color-danger)' :
                   isFight ? 'var(--color-fire)' :
                   'var(--color-bronze-300)',
            textShadow: isVictory ? '0 0 40px rgba(212, 168, 52, 0.5)' :
                        isFight ? '0 0 30px rgba(232, 85, 58, 0.4)' :
                        '0 0 20px rgba(200, 152, 104, 0.3)',
          }}
        >
          {displayPhase}
        </h1>
      </div>
    </div>
  );
}
