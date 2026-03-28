import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useUIStore } from '@/stores/uiStore';

interface DevDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function DevDrawer({ open, onClose }: DevDrawerProps) {
  const navigate = useNavigate();
  const { startLocalMatch } = useMatchStore();
  const { showDebug, toggleDebug } = useUIStore();

  if (!open) return null;

  // TODO: Currently all phase jumps start at draft — skipping to a specific
  // phase requires engine support to fast-forward match state. For now this
  // is still useful: it creates a fresh match quickly without going through
  // the matchmaking flow.
  const jumpToPhase = (_phase: string) => {
    try {
      const seed = 42; // Fixed seed for reproducibility
      startLocalMatch(seed, 'ranked', 3);
      const code = 'ai-' + Math.random().toString(36).substring(2, 8);
      navigate(`/match/${code}`);
      onClose();
    } catch (err) {
      console.error('Dev jump failed:', err);
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
            {/* Jump to Phase */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-300">
                Jump to Phase
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {['draft', 'forge', 'duel', 'adapt', 'postmatch'].map((phase) => (
                  <button
                    key={phase}
                    onClick={() => jumpToPhase(phase)}
                    className="rounded-lg border border-surface-500 bg-surface-700 px-3 py-2 text-xs font-semibold capitalize text-white transition-colors hover:border-green-500 hover:bg-surface-600"
                  >
                    {phase}
                  </button>
                ))}
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
