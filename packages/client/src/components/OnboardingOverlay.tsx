import { useState } from 'react';

interface OnboardingOverlayProps {
  onDismiss: () => void;
}

const STEPS = [
  { title: 'Draft your gems', body: 'Drag gems from the pool into your stockpile. Each gem will shape your gladiator in the coming duel.' },
  { title: 'Combine to discover', body: 'In the forge, drag two gems into the combine slots and press COMBINE. New combinations reveal new recipes — experiment!' },
  { title: 'Win with what you bring', body: 'Equip your best gems into weapon and armor sockets, then watch the duel play out. Every round, the stakes rise.' },
];

export function OnboardingOverlay({ onDismiss }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else onDismiss();
  };

  return (
    <div
      data-testid="onboarding-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(6px)',
        animation: 'fade-in 0.2s ease-out',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        className="flex max-w-md flex-col gap-4 rounded-xl p-6"
        style={{
          background: 'var(--color-surface-800)',
          border: '1px solid var(--color-surface-600)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        <p style={{ fontFamily: 'var(--font-family-display)', fontSize: 'var(--text-xs)', color: 'var(--color-accent-400)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 id="onboarding-title" style={{ fontFamily: 'var(--font-family-display)', fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'white', letterSpacing: '0.03em' }}>
          {s.title}
        </h2>
        <p style={{ color: 'var(--color-surface-200)', lineHeight: 1.5 }}>
          {s.body}
        </p>
        <div className="flex justify-between gap-3 pt-2">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm"
            style={{ color: 'var(--color-surface-400)', fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
          >
            SKIP
          </button>
          <button
            onClick={next}
            data-testid="onboarding-next"
            className="rounded-lg px-6 py-2 font-bold"
            style={{
              background: 'linear-gradient(to bottom, var(--color-accent-400), var(--color-accent-500))',
              color: 'var(--color-surface-900)',
              fontFamily: 'var(--font-family-display)',
              letterSpacing: '0.04em',
              boxShadow: 'var(--shadow-button)',
            }}
          >
            {step < STEPS.length - 1 ? 'NEXT' : 'GOT IT'}
          </button>
        </div>
      </div>
    </div>
  );
}
