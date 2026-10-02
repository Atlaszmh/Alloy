import { useEffect } from 'react';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
import { useDelveNotices } from '@/features/delve/useDelveNotices';
import { ManaChoice } from '@/features/delve/ManaChoice';
import { AnvilHub } from '@/features/delve/hub/AnvilHub';
import '@/features/delve/delve.css';

/** The Anvil (`/delve`): the hub, and on a new save the mana choice over it. */
export function DelveCamp() {
  const phase = useDelveStore((s) => s.profile.dive?.phase);
  const settled = useDelveStore((s) => !!s.profile.dive?.settled);
  const choosing = useDelveStore((s) => s.profile.pair.primary === null);
  useDelveNotices();

  // A finished dive's summary was shown on the run screen — clear it here (an abandoned one
  // has settled where it stood, mid-floor or at a stop).
  useEffect(() => {
    if (phase === 'dead' || phase === 'extracted' || settled) useDelveStore.getState().closeDive();
  }, [phase, settled]);

  return (
    <div className="delve-page delve-ui" data-testid="delve-camp">
      {/* Until the mana is chosen, nothing behind the choice takes focus or clicks. */}
      <div className="relative min-h-0 flex-1" inert={choosing}>
        <AnvilHub mode="anvil" />
      </div>
      {choosing && <ManaChoice />}
      <ToastContainer />
    </div>
  );
}
