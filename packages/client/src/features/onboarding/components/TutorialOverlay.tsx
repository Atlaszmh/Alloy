import { useState } from 'react';

interface TutorialStep {
  title: string;
  description: string;
  target?: string; // CSS selector to highlight
  position?: 'top' | 'bottom' | 'center';
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Welcome to Alloy!',
    description: 'You are a blacksmith crafting weapons and armor for your gladiator. Draft orbs, forge equipment, and watch your champion fight!',
    position: 'center',
  },
  {
    title: 'The Draft',
    description: 'Take turns picking crafting orbs from a shared pool. Each orb has an element and tier. Tap once to preview, tap again to confirm your pick.',
    position: 'center',
  },
  {
    title: 'Forging',
    description: 'Place orbs into weapon and armor slots. Combine compatible orbs for powerful compound effects. Choose your base stats wisely!',
    position: 'center',
  },
  {
    title: 'The Duel',
    description: 'Watch your gladiator auto-battle! The duel plays out based on your equipment stats. Win 2 out of 3 rounds to claim victory.',
    position: 'center',
  },
  {
    title: 'Between Rounds',
    description: 'After each duel, you get limited flux to adjust your build. Swap orbs, add new ones, or adapt to counter your opponent.',
    position: 'center',
  },
  {
    title: 'Ready to Forge!',
    description: 'Start with an AI match to learn the ropes. Good luck, blacksmith!',
    position: 'center',
  },
];

interface TutorialOverlayProps {
  onComplete: () => void;
}

export function TutorialOverlay({ onComplete }: TutorialOverlayProps) {
  const [step, setStep] = useState(0);
  const current = TUTORIAL_STEPS[step];

  const isLast = step === TUTORIAL_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="animate-slide-up mx-4 max-w-sm rounded-xl border border-accent-500/50 bg-surface-800 p-6 shadow-2xl">
        {/* Step indicator */}
        <div className="mb-4 flex justify-center gap-1">
          {TUTORIAL_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                i === step ? 'bg-accent-500' : i < step ? 'bg-accent-500/50' : 'bg-surface-600'
              }`}
            />
          ))}
        </div>

        <h3 className="mb-2 text-center text-lg font-bold text-accent-400">
          {current.title}
        </h3>
        <p className="mb-6 text-center text-sm leading-relaxed text-surface-400">
          {current.description}
        </p>

        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 rounded-lg bg-surface-600 px-4 py-2 text-sm font-medium text-surface-400 hover:bg-surface-500"
            >
              Back
            </button>
          )}
          <button
            onClick={() => {
              if (isLast) {
                onComplete();
              } else {
                setStep(step + 1);
              }
            }}
            className="flex-1 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-surface-900 hover:bg-accent-400"
          >
            {isLast ? "Let's Go!" : 'Next'}
          </button>
        </div>

        <button
          onClick={onComplete}
          className="mt-3 w-full text-center text-xs text-surface-500 hover:text-surface-400"
        >
          Skip Tutorial
        </button>
      </div>
    </div>
  );
}
