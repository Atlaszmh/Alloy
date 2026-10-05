import { useState } from 'react';
import { useNavigate } from 'react-router';
import { tutorialSkippable, unsocketMode } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { Button, Chip, Dialog, Glyph } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { SkipTutorialConfirm } from '../tutorial/SkipTutorial';
import { SHOWN_AT, stepIn } from '../tutorial/tutorial-view';
import { SettingsPanel } from './SettingsPanel';

/** An entry a screen adds to the menu, above Title screen (the Training Grounds' "Anvil", 3F). */
export interface SystemMenuEntry {
  id: string;
  label: string;
  onSelect: () => void;
}

/**
 * The one Esc / B menu: Resume, Controls, Settings, any `extra` entries, Skip
 * this step (while the engine allows it for an Anvil or Training step: the
 * pad's way to it, as the pause has it in a dive) and Skip tutorial while the
 * guided start runs, and Title screen, plus Restart and the pull rule in dev
 * builds. Controls, Settings and Skip tutorial's confirm open in its place,
 * and their Back returns to it.
 */
export function SystemMenu({
  onClose,
  extra = [],
}: {
  onClose: () => void;
  extra?: SystemMenuEntry[];
}) {
  const navigate = useNavigate();
  const unsocket = useDelveStore((s) => s.unsocket);
  const guided = useDelveStore((s) => s.profile.tutorial !== null);
  // The skip rule reads much of the save (what the step's op needs and costs): select its answer.
  const skippable = useDelveStore(
    ({ profile: p }) =>
      !!p.tutorial &&
      !!stepIn(getDelveRegistry(), p.tutorial, SHOWN_AT.anvil) &&
      tutorialSkippable(getDelveRegistry(), p, p.tutorial),
  );
  const [view, setView] = useState<'menu' | 'controls' | 'settings' | 'skip'>('menu');
  const [confirmRestart, setConfirmRestart] = useState(false);
  // Dev builds: what pulling a rune does here (the balance's rule until the chip picks one).
  const pull = unsocketMode(getDelveRegistry(), unsocket);

  if (view === 'controls') return <ControlsPanel onClose={() => setView('menu')} />;
  if (view === 'settings') return <SettingsPanel onClose={() => setView('menu')} />;
  if (view === 'skip')
    return (
      <SkipTutorialConfirm
        onConfirm={() => {
          useDelveStore.getState().skipTutorial();
          onClose();
        }}
        onClose={() => setView('menu')}
      />
    );
  return (
    <Dialog title="Menu" onClose={onClose} width={440} testId="system-menu">
      <div className="flex flex-col gap-3">
        <Button variant="primary" size="lg" onClick={onClose} testId="menu-resume" data-pad-first>
          Resume
        </Button>
        <Button onClick={() => setView('controls')} testId="open-controls">
          <Glyph id="controls" size={20} /> Controls
        </Button>
        <Button onClick={() => setView('settings')} testId="open-settings">
          <Glyph id="settings" size={20} /> Settings
        </Button>
        {extra.map((e) => (
          <Button key={e.id} onClick={e.onSelect} testId={`menu-${e.id}`}>
            {e.label}
          </Button>
        ))}
        {skippable && (
          <Button
            onClick={() => {
              useDelveStore.getState().tutorialEvents([{ type: 'skipStep' }]);
              onClose();
            }}
            testId="menu-skip-step"
          >
            Skip this step
          </Button>
        )}
        {guided && (
          <Button onClick={() => setView('skip')} testId="menu-skip-tutorial">
            Skip tutorial
          </Button>
        )}
        <Button onClick={() => navigate('/')} testId="menu-main">
          Title screen
        </Button>
        {import.meta.env.DEV && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Chip
              onClick={() => {
                if (!confirmRestart) return setConfirmRestart(true);
                setConfirmRestart(false);
                useDelveStore.getState().resetProfile();
                onClose();
              }}
              onBlur={() => setConfirmRestart(false)}
              testId="restart-delve"
            >
              {confirmRestart ? 'Press again to wipe this save' : 'Restart Delve (dev)'}
            </Chip>
            <Chip
              onClick={() =>
                useDelveStore.getState().setUnsocket(pull === 'destroy' ? 'pay' : 'destroy')
              }
              testId="unsocket-chip"
            >
              {pull === 'destroy' ? 'Pull: destroys' : 'Pull: pays'}
            </Chip>
          </div>
        )}
      </div>
    </Dialog>
  );
}
