import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDelveStore } from '@/stores/delveStore';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
import { ToastContainer } from '@/components/Toast';
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
import { HudGrid, type Insets } from '@/features/delve/arena/hud/HudGrid';
import { SkillDock } from '@/features/delve/arena/hud/SkillDock';
import { BossBar } from '@/features/delve/arena/hud/BossBar';
import { noManaToaster, playArenaEvents } from '@/features/delve/arena/arena-sounds';
import type { CoreUiEvent } from '@/features/delve/arena/useArenaCore';
import { useTrainingArena, type TrainingArena } from '@/features/delve/training/useTrainingArena';
import { MeterChip } from '@/features/delve/training/MeterView';
import { LabButton } from '@/features/delve/lab/dev-routes';
import {
  DepthLabel,
  TrainingPanel,
  blurOnPointerUp,
  openLayout,
  type PanelLayout,
  type TrainingTab,
} from '@/features/delve/training/TrainingPanel';
import { useRunePickerOpen } from '@/features/delve/runes/RunePicker';
import '@/features/delve/delve.css';

/**
 * The Training Grounds: the arena with the usual HUD, controls and sounds,
 * plus dummies, any monster, rule toggles and a damage meter, on a loadout of
 * its own. It never touches the Delve save.
 */
export function DelveTraining() {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [panel, setPanel] = useState<PanelLayout | null>(null);
  const [tab, setTab] = useState<TrainingTab>('loadout');
  const [controlsOpen, setControlsOpen] = useState(false);

  // Docked and open on entry where it docks; otherwise closed until asked for.
  useLayoutEffect(() => {
    if (openLayout(pageRef.current) === 'dock') setPanel('dock');
  }, []);

  // A rune picker over the docked panel pauses too: Space and the pad belong to it.
  const picking = useRunePickerOpen();
  const paused = panel === 'sheet' || controlsOpen || picking;
  // A layout effect, so the controller changes owner in the same commit as the pause.
  useLayoutEffect(() => {
    setArenaLive(!paused);
    return () => setArenaLive(false);
  }, [paused]);
  const manualAttack = useDelveStore((s) => s.manualAttack);

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
  /** The Attack slot's click in Manual: one blow, as a tap of the attack input. */
  const tapAttack = () => {
    arena.attack(true);
    arena.attack(false);
  };
  const trainingPanel = panel && (
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
  );

  return (
    <div ref={pageRef} className="delve-page select-none bg-black" data-testid="delve-training">
      <div ref={hostRef} className="absolute inset-0" data-testid="arena" />
      <ArenaControls
        input={arena.input}
        heroScreen={arena.heroScreen}
        pixelsPerUnit={arena.pixelsPerUnit}
        disabled={paused}
        manualAttack={manualAttack}
      />

      <HudGrid
        onInsets={setInsets}
        top={
          <div
            className="k-glass pointer-events-auto flex h-full items-center gap-2 px-4"
            onPointerUp={blurOnPointerUp}
          >
            <button
              type="button"
              className="delve-btn px-2.5 py-1.5 text-sm"
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
            <LabButton />
            <button
              type="button"
              className="delve-btn px-2.5 py-1.5 text-sm"
              aria-label="Panel"
              aria-expanded={panel !== null}
              onClick={togglePanel}
              data-pad-menu
              data-testid="training-panel-toggle"
            >
              ☰<span className="hidden sm:inline"> Panel</span>
            </button>
          </div>
        }
        right={
          // Today's panel, its small text kept at its own size until 3F rebuilds it (decided item 38).
          panel === 'dock' && (
            <div
              className="pointer-events-auto relative min-h-0 flex-1"
              style={{ zoom: 'calc(1 / var(--hud-scale))' }}
            >
              {trainingPanel}
            </div>
          )
        }
        dock={
          <SkillDock
            hud={arena.hud}
            world={arena.worldRef}
            onCast={arena.cast}
            onDodge={arena.dodge}
            onPotion={arena.potion}
            onAttack={tapAttack}
            manualAttack={manualAttack}
          />
        }
      >
        <BossBar hud={arena.hud} />
      </HudGrid>

      {panel === 'sheet' && trainingPanel}
      {/* After the panel: the controller's back button and focus go to the topmost one. */}
      {controlsOpen && <ControlsPanel onClose={() => setControlsOpen(false)} />}
      <ToastContainer />
    </div>
  );
}
