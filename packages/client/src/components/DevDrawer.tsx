import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useForgeStore } from '@/stores/forgeStore';
import { useUIStore } from '@/stores/uiStore';
import type { DebugPhaseTarget } from '@alloy/engine';

interface DevDrawerProps {
  open: boolean;
  onClose: () => void;
}

const PHASE_TARGETS: { label: string; target: DebugPhaseTarget }[] = [
  { label: 'draft', target: 'draft' },
  { label: 'forge', target: 'forge' },
  { label: 'duel', target: 'duel' },
  { label: 'postmatch', target: 'complete' },
];

const RUN_PHASES = ['draft', 'forge', 'duel'] as const;
const RUN_ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function DevDrawer({ open, onClose }: DevDrawerProps) {
  const navigate = useNavigate();
  const { startDebugMatch } = useMatchStore();
  const { showDebug, toggleDebug } = useUIStore();
  const [selectedRunRound, setSelectedRunRound] = useState(1);
  const [selectedRunPhase, setSelectedRunPhase] = useState<typeof RUN_PHASES[number]>('forge');
  const [selectedAiTier, setSelectedAiTier] = useState<1 | 2 | 3 | 4 | 5>(3);

  if (!open) return null;

  const jumpToPhase = (target: DebugPhaseTarget) => {
    try {
      const seed = 42; // Fixed seed for reproducibility
      startDebugMatch({ seed, mode: 'ranked', aiTier: 3, targetPhase: target });

      // Skip the BaseItemSelector for phases that already have items set
      if (target !== 'draft') {
        useForgeStore.setState({
          itemSelectionPhase: 'done',
          selectedWeaponId: 'sword',
          selectedArmorId: 'chainmail',
        });
      }

      const code = 'ai-' + Math.random().toString(36).substring(2, 8);
      navigate(`/match/${code}`);
      onClose();
    } catch (err) {
      console.error('Dev jump failed:', err);
    }
  };

  const jumpToRunPhase = () => {
    try {
      const seed = 42;
      startDebugMatch({
        seed,
        mode: 'run_async',
        aiTier: selectedAiTier,
        targetPhase: selectedRunPhase === 'duel' ? 'duel' : selectedRunPhase === 'forge' ? 'forge' : 'draft',
        weaponId: 'sword',
        armorId: 'chainmail',
        targetRound: selectedRunRound,
        runConfig: { startingLives: 3, goalRound: 10 },
      });

      // Skip the BaseItemSelector
      useForgeStore.setState({
        itemSelectionPhase: 'done',
        selectedWeaponId: 'sword',
        selectedArmorId: 'chainmail',
      });

      const code = 'ai-run-' + Math.random().toString(36).substring(2, 8);
      navigate(`/match/${code}`);
      onClose();
    } catch (err) {
      console.error('Dev run jump failed:', err);
    }
  };

  const handleReset = () => {
    navigate('/');
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="absolute inset-0 z-40 bg-black/50" onClick={onClose} />
      {/* Drawer */}
      <div
        className="absolute inset-x-0 bottom-[46px] z-50 flex flex-col rounded-t-2xl border-t border-surface-500 bg-surface-800"
        style={{ maxHeight: '60%', animation: 'drawer-up 0.25s ease-out' }}
      >
        {/* Handle bar */}
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 rounded-full bg-surface-500" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <h2
            className="text-base font-bold text-green-400"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            Dev Tools
          </h2>
          <button onClick={onClose} className="text-sm text-surface-300 hover:text-white">
            Done
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto px-4 pb-4">
          <div className="flex flex-col gap-4">
            {/* Jump to Phase (Ranked Mode) */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
                Ranked Mode
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {PHASE_TARGETS.map(({ label, target }) => (
                  <button
                    key={target}
                    onClick={() => jumpToPhase(target)}
                    className="rounded-lg border border-surface-500 bg-surface-700 px-3 py-2 text-xs font-semibold capitalize text-white transition-colors hover:border-green-500 hover:bg-surface-600"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {/* Run Mode Debug */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
                Run Mode Debug
              </h3>
              <div className="space-y-3">
                {/* AI Tier Selection */}
                <div>
                  <label className="text-xs font-medium text-surface-400">AI Tier</label>
                  <div className="mt-1 grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((tier) => (
                      <button
                        key={tier}
                        onClick={() => setSelectedAiTier(tier as 1 | 2 | 3 | 4 | 5)}
                        className={`rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                          selectedAiTier === tier
                            ? 'bg-green-600 text-white'
                            : 'border border-surface-500 bg-surface-700 text-surface-300 hover:border-green-500'
                        }`}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Round Selection */}
                <div>
                  <label className="text-xs font-medium text-surface-400">Round (1-10)</label>
                  <div className="mt-1 grid grid-cols-5 gap-1">
                    {RUN_ROUNDS.map((round) => (
                      <button
                        key={round}
                        onClick={() => setSelectedRunRound(round)}
                        className={`rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                          selectedRunRound === round
                            ? 'bg-green-600 text-white'
                            : 'border border-surface-500 bg-surface-700 text-surface-300 hover:border-green-500'
                        }`}
                      >
                        {round}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Phase Selection */}
                <div>
                  <label className="text-xs font-medium text-surface-400">Phase</label>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {RUN_PHASES.map((phase) => (
                      <button
                        key={phase}
                        onClick={() => setSelectedRunPhase(phase)}
                        className={`rounded px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                          selectedRunPhase === phase
                            ? 'bg-green-600 text-white'
                            : 'border border-surface-500 bg-surface-700 text-surface-300 hover:border-green-500'
                        }`}
                      >
                        {phase}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Jump Button */}
                <button
                  onClick={jumpToRunPhase}
                  className="w-full rounded-lg border border-green-500 bg-green-600/20 px-3 py-2 text-xs font-semibold text-green-400 transition-colors hover:bg-green-600/30"
                >
                  Jump to Run
                </button>

              </div>
            </section>

            {/* Animations */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
                Animations
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {['Swoop', 'Phase Transition', 'Celebration'].map((name) => (
                  <button
                    key={name}
                    onClick={() => console.log(`[Dev] Trigger: ${name}`)}
                    className="rounded-lg border border-surface-500 bg-surface-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-green-500 hover:bg-surface-600"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </section>

            {/* Debug */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
                Debug
              </h3>
              <div className="rounded-lg border border-surface-600 bg-surface-800 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Debug Overlays</div>
                    <div className="text-xs text-surface-300">Show debug info on screen</div>
                  </div>
                  <button
                    onClick={toggleDebug}
                    className={`relative h-6 w-11 rounded-full transition-colors ${showDebug ? 'bg-green-500' : 'bg-surface-600'}`}
                  >
                    <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${showDebug ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </section>

            {/* Reset */}
            <section>
              <button
                onClick={handleReset}
                className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20"
              >
                Reset &amp; Return Home
              </button>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
