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
  const choosing = useDelveStore((s) => s.profile.pair.primary === null);
  useDelveNotices();

  // A finished dive's summary was shown on the run screen — clear it here.
  useEffect(() => {
    if (phase === 'dead' || phase === 'extracted') useDelveStore.getState().closeDive();
  }, [phase]);

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
