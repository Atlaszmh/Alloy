import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useControlsStore } from '@/stores/controlsStore';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
import { ToastContainer } from '@/components/Toast';
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
import {
  AttackButton,
  BossBar,
  keyHints,
  padHints,
  SkillBar,
  Vitals,
} from '@/features/delve/arena/ArenaHud';
import { noManaToaster, playArenaEvents } from '@/features/delve/arena/arena-sounds';
import type { CoreUiEvent } from '@/features/delve/arena/useArenaCore';
import { useTrainingArena, type TrainingArena } from '@/features/delve/training/useTrainingArena';
import { MeterChip } from '@/features/delve/training/MeterView';
import {
  DOCK_WIDTH,
  DepthLabel,
  TrainingPanel,
  blurOnPointerUp,
  openLayout,
  type PanelLayout,
  type TrainingTab,
} from '@/features/delve/training/TrainingPanel';
import '@/features/delve/delve.css';

const fineMouse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

/**
 * The Training Grounds: the arena with the usual HUD, controls and sounds,
 * plus dummies, any monster, rule toggles and a damage meter, on a loadout of
 * its own. It never touches the Delve save.
 */
export function DelveTraining() {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 60, bottom: 190 });
  const [panel, setPanel] = useState<PanelLayout | null>(null);
  const [tab, setTab] = useState<TrainingTab>('loadout');
  const [controlsOpen, setControlsOpen] = useState(false);

  // Docked and open on entry where it docks; otherwise closed until asked for.
  useLayoutEffect(() => {
    if (openLayout(pageRef.current) === 'dock') setPanel('dock');
  }, []);

  // Keep the camera clear of the HUD.
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      setInsets({
        top: topRef.current?.offsetHeight ?? 60,
        bottom: bottomRef.current?.offsetHeight ?? 190,
      });
    });
    if (topRef.current) ro.observe(topRef.current);
    if (bottomRef.current) ro.observe(bottomRef.current);
    return () => ro.disconnect();
  }, []);

  const paused = panel === 'sheet' || controlsOpen;
  // A layout effect, so the controller changes owner in the same commit as the pause.
  useLayoutEffect(() => {
    setArenaLive(!paused);
    return () => setArenaLive(false);
  }, [paused]);
  const manualAttack = useDelveStore((s) => s.manualAttack);
  const device = useInputDeviceStore((s) => s.device);
  const controls = useControlsStore((s) => s.config);
  const hints = device === 'gamepad' ? padHints(controls) : fineMouse ? keyHints(controls) : null;

  // The dive's sounds, haptics and no-mana toast.
  const arenaRef = useRef<TrainingArena | null>(null);
  const noManaToast = useMemo(() => noManaToaster(), []);
  const onUi = useCallback(
    (e: CoreUiEvent) => {
      if (e.kind === 'events') playArenaEvents(e.events);
      else noManaToast(arenaRef.current?.hud?.abilities[e.slot]?.name);
    },
    [noManaToast],
  );
  const arena = useTrainingArena(hostRef, { paused, insets, onUi, manualAttack });
  arenaRef.current = arena;

  // Stable, so the memoised panel only re-renders for its own props (and the meter).
  const togglePanel = useCallback(() => {
    const next = openLayout(pageRef.current);
    setPanel((p) => (p ? null : next));
  }, []);
  const closePanel = useCallback(() => setPanel(null), []);
  const openControls = useCallback(() => setControlsOpen(true), []);
  const exit = useCallback(() => navigate('/delve'), [navigate]);

  return (
    <div ref={pageRef} className="delve-page select-none bg-black" data-testid="delve-training">
      {/* The arena and its HUD narrow beside a docked panel, so the camera centres in view. */}
      <div
        className="absolute inset-y-0 left-0"
        style={{ right: panel === 'dock' ? DOCK_WIDTH : 0 }}
      >
        <div ref={hostRef} className="absolute inset-0" data-testid="arena" />
        <ArenaControls
          input={arena.input}
          heroScreen={arena.heroScreen}
          pixelsPerUnit={arena.pixelsPerUnit}
          disabled={paused}
          manualAttack={manualAttack}
        />

        <div
          ref={topRef}
          className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pb-3 pt-2"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0))' }}
          onPointerUp={blurOnPointerUp}
        >
          <div className="mx-auto flex max-w-[640px] items-center gap-2">
            {/* Icon-only on phones, so the meter keeps its room. */}
            <button
              type="button"
              className="delve-btn pointer-events-auto px-2.5 py-1.5 text-sm"
              onClick={exit}
              aria-label="Back to the Anvil"
              data-testid="training-back"
            >
              ◂<span className="hidden sm:inline"> Anvil</span>
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
              <DepthLabel />
              <MeterChip meter={arena.meter} onReset={arena.actions.resetMeter} />
            </div>
            <button
              type="button"
              className="delve-btn pointer-events-auto px-2.5 py-1.5 text-sm"
              aria-label="Panel"
              aria-expanded={panel !== null}
              onClick={togglePanel}
              data-pad-menu
              data-testid="training-panel-toggle"
            >
              ☰<span className="hidden sm:inline"> Panel</span>
            </button>
          </div>
        </div>
        <BossBar hud={arena.hud} />

        <div
          ref={bottomRef}
          className="absolute inset-x-0 bottom-0 z-20 px-3 pt-6"
          style={{
            background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 55%, rgba(0,0,0,0))',
            paddingBottom: 'calc(10px + var(--spacing-safe-bottom))',
            pointerEvents: 'none',
          }}
        >
          <div className="pointer-events-auto mx-auto flex max-w-[520px] flex-col gap-2">
            <Vitals hud={arena.hud} />
            {manualAttack && (!fineMouse || device === 'gamepad') && (
              <div className="flex justify-end pr-1">
                <AttackButton hud={arena.hud} onAttack={arena.attack} hint={hints?.attack} />
              </div>
            )}
            <SkillBar
              hud={arena.hud}
              onCast={arena.cast}
              onAim={arena.aim}
              onPotion={arena.potion}
              onDodge={arena.dodge}
              hints={hints}
            />
          </div>
        </div>
      </div>

      {panel && (
        <TrainingPanel
          layout={panel}
          tab={tab}
          onTab={setTab}
          onClose={closePanel}
          onExit={exit}
          actions={arena.actions}
          meter={arena.meter}
          onOpenControls={openControls}
        />
      )}
      {/* After the panel: the controller's back button and focus go to the topmost one. */}
      {controlsOpen && <ControlsPanel onClose={() => setControlsOpen(false)} />}
      <ToastContainer />
    </div>
  );
}
