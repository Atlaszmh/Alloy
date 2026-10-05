import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDelveStore } from '@/stores/delveStore';
import { useSandboxStore } from '@/stores/sandboxStore';
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
import { FOCUSABLE } from '@/features/gamepad/use-gamepad-nav';
import { ToastContainer } from '@/components/Toast';
import { usePrompts, type Prompt } from '@/features/delve/kit';
import { SystemMenu } from '@/features/delve/hub/SystemMenu';
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
import { HudGrid, type Insets } from '@/features/delve/arena/hud/HudGrid';
import { SkillDock } from '@/features/delve/arena/hud/SkillDock';
import { BossBar } from '@/features/delve/arena/hud/BossBar';
import { noManaToaster, playArenaEvents } from '@/features/delve/arena/arena-sounds';
import type { CoreUiEvent } from '@/features/delve/arena/useArenaCore';
import { useTrainingArena, type TrainingArena } from '@/features/delve/training/useTrainingArena';
import { TrainingBar } from '@/features/delve/training/TrainingBar';
import { TrainingPanel, type TrainingTab } from '@/features/delve/training/TrainingPanel';
import { useRunePickerOpen } from '@/features/delve/runes/RunePicker';
import { getDelveRegistry } from '@/features/delve/registry';
import { TutorialPanel } from '@/features/delve/tutorial/TutorialPanel';
import { SHOWN_AT, stepIn } from '@/features/delve/tutorial/tutorial-view';
import '@/features/delve/delve.css';

/** The Training dock's width in design px (the HUD grid's right column). */
const DOCK_WIDTH = 400;

/**
 * The Training Grounds: the arena with the usual HUD, controls and sounds,
 * plus dummies, any monster, rule toggles and a damage meter, on a loadout of
 * its own. It never touches the Delve save. The dock (the right column) opens
 * on entry; with the mouse the fight runs on beside it. Under the pad, View
 * (the Panel button) opens it and gives it the focus, pausing; B or View
 * again hands the pad back to the fight, the dock staying open. Menu opens
 * the system menu, with an Anvil entry, pausing too. On the guided start's
 * Training step it opens on the hero's own build, with Hesta's panel at the
 * bottom of the right column (see the tutorial spec).
 */
export function DelveTraining() {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [panelOpen, setPanelOpen] = useState(true);
  /** The pad's focus is in the dock (opened with View): the fight waits. */
  const [padFocus, setPadFocus] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<TrainingTab>('loadout');
  const [controlsOpen, setControlsOpen] = useState(false);
  const tutorial = useDelveStore((s) => s.profile.tutorial);
  const tutorialStep = stepIn(getDelveRegistry(), tutorial, SHOWN_AT.training);
  // The guided start's Training step opens on the hero's own build ("Load my build").
  useEffect(() => {
    const { profile } = useDelveStore.getState();
    if (stepIn(getDelveRegistry(), profile.tutorial, SHOWN_AT.training))
      useSandboxStore.getState().loadMyBuild(profile);
  }, []);
  // The pad's focus goes with the pad: a key or the mouse taking the input lock hands the fight back.
  useEffect(
    () =>
      useInputDeviceStore.subscribe((s) => {
        if (s.device !== 'gamepad') setPadFocus(false);
      }),
    [],
  );

  // A rune picker in the dock pauses too: Space and the pad belong to it.
  const picking = useRunePickerOpen();
  // A reading beat holds the fight until its Continue.
  const paused = padFocus || menuOpen || controlsOpen || picking || !!tutorialStep?.beat;
  // A layout effect, so the controller changes owner in the same commit as the pause.
  useLayoutEffect(() => {
    setArenaLive(!paused);
    return () => setArenaLive(false);
  }, [paused]);
  const manualAttack = useDelveStore((s) => s.manualAttack);

  // The dock takes the pad's focus on its first control (never a tab: LB/RB step those), and
  // gives it up when the pad leaves.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (padFocus)
      [...(dock?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
        .find((el) => !el.closest('[data-pad-skip]'))
        ?.focus();
    else if (
      document.activeElement instanceof HTMLElement &&
      dock?.contains(document.activeElement)
    )
      document.activeElement.blur();
  }, [padFocus]);

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

  /** The Panel button: the pad's View focuses the open dock; the mouse and keys toggle it. */
  const onPanel = () => {
    if (useInputDeviceStore.getState().device === 'gamepad') {
      setPanelOpen(true);
      setPadFocus(true);
    } else {
      setPanelOpen((open) => !open);
      setPadFocus(false);
    }
  };
  // Stable, so the memoised panel only re-renders for its own props (and the meter).
  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPadFocus(false);
  }, []);
  const openControls = useCallback(() => setControlsOpen(true), []);
  const exit = useCallback(() => navigate('/delve'), [navigate]);
  /** The Attack slot's click in Manual: one blow, as a tap of the attack input. */
  const tapAttack = () => {
    arena.attack(true);
    arena.attack(false);
  };

  // While the dock has the pad's focus (its own scope): B or View hands it back, Menu opens the menu.
  const journal = useControlsStore((s) => s.config.keys.journal);
  const view = useControlsStore((s) => s.config.pad.journal);
  const unfocus = () => setPadFocus(false);
  const off = !padFocus;
  const dockPrompts: Prompt[] = [
    {
      id: 'back',
      label: 'Back',
      binding: { key: 'Escape', pad: 'b' },
      onPress: unfocus,
      disabled: off,
    },
    {
      id: 'view',
      label: 'Fight',
      binding: { key: journal ?? undefined, pad: view ?? undefined },
      onPress: unfocus,
      disabled: off,
    },
    {
      id: 'menu',
      label: 'Menu',
      binding: { pad: 'menu' },
      onPress: () => setMenuOpen(true),
      disabled: off,
    },
  ];
  usePrompts(dockPrompts, dockRef);

  return (
    <div className="delve-page select-none bg-black" data-testid="delve-training">
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
        rightWidth={DOCK_WIDTH}
        top={
          <TrainingBar
            meter={arena.meter}
            onResetMeter={arena.actions.resetMeter}
            panelOpen={panelOpen}
            onBack={exit}
            onPanel={onPanel}
            onMenu={() => setMenuOpen(true)}
          />
        }
        right={
          <>
            {panelOpen && (
              <div
                ref={dockRef}
                className="pointer-events-auto flex min-h-0 flex-1 flex-col"
                data-pad-scope={padFocus || undefined}
              >
                <TrainingPanel
                  tab={tab}
                  onTab={setTab}
                  onClose={closePanel}
                  actions={arena.actions}
                  meter={arena.meter}
                  onOpenControls={openControls}
                />
              </div>
            )}
            {/* Hesta's panel, docked bottom right (see the tutorial spec). */}
            {tutorial && tutorialStep && (
              <div className="mt-auto">
                <TutorialPanel
                  state={tutorial}
                  where={SHOWN_AT.training}
                  place="hud"
                  onEvent={(e) => useDelveStore.getState().tutorialEvents([e])}
                />
              </div>
            )}
          </>
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

      {menuOpen && (
        <SystemMenu
          onClose={() => setMenuOpen(false)}
          extra={[{ id: 'anvil', label: 'Anvil', onSelect: exit }]}
        />
      )}
      {/* After the panel: the controller's back button and focus go to the topmost one. */}
      {controlsOpen && <ControlsPanel onClose={() => setControlsOpen(false)} />}
      <ToastContainer />
    </div>
  );
}
