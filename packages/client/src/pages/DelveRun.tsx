import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import {
  chooseDoor,
  drinkPotionBetweenFloors,
  extractDive,
  settleDive,
  startDepthOptions,
  tutorialSkippable,
  type GearItem,
  type Haul,
  type StopAction,
  type StopKind,
  type TutorialEvent,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useUIStore } from '@/stores/uiStore';
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { ToastContainer, showToast } from '@/components/Toast';
import { getDelveRegistry } from '@/features/delve/registry';
import { useDelveNotices } from '@/features/delve/useDelveNotices';
import { DiveSummary } from '@/features/delve/DiveSummary';
import { LegendaryFanfare } from '@/features/delve/LegendaryFanfare';
import { PauseScreen } from '@/features/delve/hub/PauseScreen';
import type { HubLink } from '@/features/delve/hub/types';
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
import { AlcoveDialog, ExitConfirm } from '@/features/delve/arena/FloorDialogs';
import { InteractPlaque } from '@/features/delve/arena/hud/InteractPlaque';
import { HudGrid, type Insets } from '@/features/delve/arena/hud/HudGrid';
import { PurseBar } from '@/features/delve/arena/hud/PurseBar';
import { SkillDock } from '@/features/delve/arena/hud/SkillDock';
import { BossBar } from '@/features/delve/arena/hud/BossBar';
import { FloorColumn } from '@/features/delve/arena/hud/FloorColumn';
import { GainFeed } from '@/features/delve/arena/hud/GainFeed';
import { LeanCorner } from '@/features/delve/arena/hud/LeanCorner';
import { useQuests } from '@/features/delve/quests/useQuests';
import { StopScreen } from '@/features/delve/stop/StopScreen';
import { TutorialPanel } from '@/features/delve/tutorial/TutorialPanel';
import { RetryScreen } from '@/features/delve/tutorial/RetryScreen';
import { SHOWN_AT, stepIn } from '@/features/delve/tutorial/tutorial-view';
import { reducedMotion } from '@/features/delve/kit';
import { useArena, type ArenaUiEvent } from '@/features/delve/arena/useArena';
import { noManaToaster, playArenaEvents } from '@/features/delve/arena/arena-sounds';
import '@/features/delve/delve.css';

interface BannerState {
  id: number;
  title: string;
  sub?: string;
  color: string;
}

function Banner({ banner, onDone }: { banner: BannerState; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The animation is the banner's life; under reduced motion it only fades, never zooms.
    const anim = ref.current?.animate(
      reducedMotion()
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
        : [
            { transform: 'scale(2.2)', opacity: 0 },
            { transform: 'scale(0.96)', opacity: 1, offset: 0.15 },
            { transform: 'scale(1)', opacity: 1, offset: 0.8 },
            { transform: 'scale(1.04)', opacity: 0 },
          ],
      { duration: 2000, easing: 'ease-out' },
    );
    const done = () => onDone();
    anim?.finished.then(done, done);
    return () => anim?.cancel();
  }, [banner.id, onDone]);
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-0 top-[26%] z-30 px-4 text-center"
      data-testid="delve-banner"
    >
      <div
        className="delve-display text-3xl font-bold tracking-[0.12em]"
        style={{ color: banner.color, textShadow: '2px 2px 0 #181425' }}
      >
        {banner.title}
      </div>
      {banner.sub && (
        <div className="delve-display mt-1 text-sm font-semibold text-stone-100 [text-shadow:2px_2px_0_#181425]">
          {banner.sub}
        </div>
      )}
    </div>
  );
}

export function DelveRun() {
  const navigate = useNavigate();
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const dive = profile.dive;

  const hostRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [pause, setPause] = useState<{ link?: HubLink } | null>(null);
  const [fanfares, setFanfares] = useState<{ item: GearItem; firstTime: boolean }[]>([]);
  /** The last cleared floor's haul, for the stop's "Found this floor" (none after a reload). */
  const [floorHaul, setFloorHaul] = useState<Haul | null>(null);
  const [banners, setBanners] = useState<BannerState[]>([]);
  /** The exit gate's question (the rooms left unexplored), or null. */
  const [exitAsk, setExitAsk] = useState<number | null>(null);
  /** An open anvil alcove's offers, or null. */
  const [alcove, setAlcove] = useState<StopKind[] | null>(null);
  /** A fall while the guided start runs: the retry screen, in place of the summary. */
  const [fallen, setFallen] = useState(false);
  /** Reads the floor's tutorial again at once, after the page sends it an event. */
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const bannerId = useRef(0);
  const noManaToast = useMemo(() => noManaToaster(), []);
  useDelveNotices(!!dive);

  const showBanner = useCallback((title: string, color: string, sub?: string) => {
    setBanners((b) => [...b, { id: ++bannerId.current, title, sub, color }]);
  }, []);
  const popBanner = useCallback(() => setBanners((b) => b.slice(1)), []);
  const popFanfare = useCallback(() => setFanfares((f) => f.slice(1)), []);

  const arenaRef = useRef<ReturnType<typeof useArena> | null>(null);
  const onUi = useCallback(
    (e: ArenaUiEvent) => {
      switch (e.kind) {
        case 'events':
          playArenaEvents(e.events);
          break;
        case 'loot':
          if (e.bagFull) showToast('Bag full: extra loot was salvaged');
          break;
        case 'patterns':
          for (const id of e.ids) showToast(`Pattern learned: ${registry.getGearBase(id).name}`);
          break;
        case 'legendary':
          playSound('lootLegendary');
          vibrate('heavy');
          setFanfares((f) => [...f, { item: e.item, firstTime: e.firstTime }]);
          break;
        case 'reaction': {
          const def = registry.getReaction(e.reaction);
          playSound('synergyActivate');
          showBanner(`${def.name.toUpperCase()}!`, '#e9d5ff', `Reaction discovered: ${def.text}`);
          break;
        }
        case 'cleared': {
          setFloorHaul(e.haul);
          const d = useDelveStore.getState().profile.dive;
          playSound('victory');
          if (e.bossKilled)
            showBanner(
              'BOSS SLAIN',
              '#fde68a',
              `Checkpoint unlocked: start at depth ${(d?.depth ?? 0) + 1}`,
            );
          else showBanner(`DEPTH ${d?.depth ?? ''} CLEARED`, '#fcd34d', `+${e.bountyAdded} bounty`);
          break;
        }
        case 'noMana':
          noManaToast(arenaRef.current?.hud?.abilities[e.slot]?.name);
          break;
        case 'fell':
          break;
        case 'tutorialFell':
          setFallen(true);
          break;
        case 'exitRequest':
          setExitAsk(e.unexplored);
          break;
        case 'alcove':
          setAlcove(e.offers);
          break;
      }
    },
    [registry, showBanner, noManaToast],
  );

  const choosing = dive?.phase === 'choosing';
  // The guided start (see the tutorial spec): the floor's own state while it is fought (it runs
  // ahead of the save's, which each bank catches up), else the save's.
  const fighting = dive?.phase === 'fighting' && !dive.settled;
  const world = arenaRef.current?.worldRef.current ?? null;
  const tutorial = fighting ? (world?.tutorial ?? null) : profile.tutorial;
  const tutorialStep = stepIn(registry, tutorial, SHOWN_AT.dive);
  // A reading beat holds the fight until its Continue, with no pause screen.
  const beat = !!tutorialStep?.beat;
  // An abandon settles the dive where it stands (it counts as a death): the summary shows it too.
  const finished = dive?.phase === 'dead' || dive?.phase === 'extracted' || !!dive?.settled;
  // The floor's dialogs (the exit confirm, an alcove) pause the fight under them.
  const asking = exitAsk !== null || !!alcove;
  const paused = !!pause || fanfares.length > 0 || choosing || finished || asking || beat || fallen;
  // A layout effect, so the controller switches owner in the same commit as the
  // pause or resume: a press right after resuming reaches the fight, not the menus.
  useLayoutEffect(() => {
    setArenaLive(!paused);
    return () => setArenaLive(false);
  }, [paused]);
  // Hesta's strip in the HUD: a floor's steps only (the stop shows its own), never under the retry screen.
  const guidedFloor = !fallen && !!stepIn(registry, tutorial, SHOWN_AT.floor);
  const manualAttack = useDelveStore((s) => s.manualAttack);
  // Settings → HUD (the pad-first spec, 3): the lean HUD by default, today's full one by choice.
  const lean = useUIStore((s) => s.hudMode) === 'lean';
  const arena = useArena(hostRef, { paused, insets, onUi, manualAttack });
  arenaRef.current = arena;
  const { quests } = useQuests();

  useEffect(() => {
    if (!dive) navigate('/delve', { replace: true });
  }, [dive, navigate]);

  // Stable, so the memoised stop and pause skip the arena's 80 ms HUD refreshes.
  const onChooseDoor = useCallback(
    (doorId: string) => {
      const before = useDelveStore.getState().profile;
      const next = chooseDoor(registry, before, doorId);
      useDelveStore.getState().setProfile(next);
      if (next.bestDepth > before.bestDepth && before.bestDepth > 0) {
        showBanner('NEW RECORD', '#4ade80', `Deepest depth reached: ${next.bestDepth}`);
      }
    },
    [registry, showBanner],
  );
  const onExtract = useCallback(
    () =>
      useDelveStore.getState().setProfile(extractDive(registry, useDelveStore.getState().profile)),
    [registry],
  );
  const onDoorPotion = useCallback(() => {
    const next = drinkPotionBetweenFloors(registry, useDelveStore.getState().profile);
    if (next) {
      useDelveStore.getState().setProfile(next);
      playSound('potion');
    } else playSound('combineFail');
  }, [registry]);
  const onCamp = useCallback(() => {
    useDelveStore.getState().closeDive();
    navigate('/delve');
  }, [navigate]);
  /** The pause over the dive or the stop, on `link`'s tab (Loadout without one). */
  const openPause = useCallback((link?: HubLink) => setPause({ link }), []);
  const openMenu = useCallback(() => setPause({}), []);
  /** A find, from the Found log or the stop: the pause's Loadout, on that item. */
  const openItem = useCallback(
    (uid: string) => {
      useDelveStore.getState().markSeen([uid]);
      openPause({ tab: 'loadout', uid });
    },
    [openPause],
  );
  const openJournal = useCallback(() => openPause({ tab: 'quests' }), [openPause]);
  const resume = useCallback(() => setPause(null), []);
  const stay = useCallback(() => setExitAsk(null), []);
  /** The exit confirm's Leave: the floor ends on the arena's next frame. */
  const leave = useCallback(() => {
    arenaRef.current?.leave();
    setExitAsk(null);
  }, []);
  const closeAlcove = useCallback(() => setAlcove(null), []);
  const takeAlcove = useCallback((action: StopAction) => arenaRef.current!.alcove(action), []);
  /**
   * The floor restarts when the dive resumes: what it picked up since the last bank banks first.
   * While the guided start runs it restarts as it was entered (its retry), nothing banked.
   */
  const toAnvil = useCallback(() => {
    const s = useDelveStore.getState();
    if (s.profile.tutorial && s.profile.dive?.phase === 'fighting') s.retryTutorialDepth();
    else arenaRef.current?.flush();
    navigate('/delve');
  }, [navigate]);
  /**
   * Abandon counts as a death (the crafting spec's S2): the dive settles, and the summary shows its
   * losses. While the guided start runs, mid-floor, it is the depth's retry.
   */
  const abandon = useCallback(() => {
    setPause(null);
    const { profile: p } = useDelveStore.getState();
    if (p.tutorial && p.dive?.phase === 'fighting') return arenaRef.current?.retry();
    arenaRef.current?.flush();
    const s = useDelveStore.getState();
    s.setProfile(settleDive(registry, s.profile, 'abandon'));
  }, [registry]);
  /** A beat's Continue or Skip this step: to the floor under way, else to the save. */
  const onTutorial = useCallback(
    (event: TutorialEvent) => {
      if (fighting) arenaRef.current?.tutorialEvent(event);
      else useDelveStore.getState().tutorialEvents([event]);
      bump();
    },
    [fighting],
  );
  const skipStep = useCallback(() => onTutorial({ type: 'skipStep' }), [onTutorial]);
  /** The pause's Skip tutorial: the save's rails, and the floor's while one is fought. */
  const skipTutorial = useCallback(() => {
    const s = useDelveStore.getState();
    const fought = s.profile.dive?.phase === 'fighting';
    s.skipTutorial(fought ? (arenaRef.current?.worldRef.current ?? null) : null);
    bump();
  }, []);
  /** The retry screen's Retry: the depth as it was entered, on a new floor. */
  const retry = useCallback(() => {
    setFallen(false);
    arenaRef.current?.retry();
  }, []);
  /** The retry screen's Skip tutorial: the depth starts again, as an ordinary floor. */
  const skipFallen = useCallback(() => {
    setFallen(false);
    arenaRef.current?.retry(true);
  }, []);

  if (!dive) return null;

  const biome = registry.getBiomeForDepth(dive.depth);
  const starts = startDepthOptions(registry, profile);
  const skippable =
    !!tutorial && !!tutorialStep && tutorialSkippable(registry, profile, tutorial, world);

  const onAgain = () => {
    const s = useDelveStore.getState();
    s.closeDive();
    s.startDive(starts[starts.length - 1]);
    playSound('phaseTransition');
  };
  /** The Attack slot's click in Manual: one blow, as a tap of the attack input. */
  const tapAttack = () => {
    arena.attack(true);
    arena.attack(false);
  };

  return (
    <div className="delve-page select-none bg-black" data-testid="delve-run">
      <div ref={hostRef} className="absolute inset-0" data-testid="arena" />
      <ArenaControls
        input={arena.input}
        heroScreen={arena.heroScreen}
        pixelsPerUnit={arena.pixelsPerUnit}
        disabled={paused}
        manualAttack={manualAttack}
      />
      {!paused && arena.hud?.prompt && (
        <InteractPlaque
          prompt={arena.hud.prompt}
          world={arena.worldRef}
          heroScreen={arena.heroScreen}
          pixelsPerUnit={arena.pixelsPerUnit}
        />
      )}

      <HudGrid
        testId="dive-hud"
        onInsets={setInsets}
        insetRight={!lean}
        inert={!!pause || choosing || asking || fallen}
        hidden={choosing && !finished}
        top={
          lean ? (
            // While the fight is live every toast is a line of the feed (`routeToasts`).
            <GainFeed live={!paused} />
          ) : (
            <PurseBar dive={dive} onMenu={openMenu} onJournal={openJournal} />
          )
        }
        right={
          lean ? (
            <LeanCorner
              dive={dive}
              biome={biome}
              // One goal on screen: the tracked quests give way to a guided step.
              quests={guidedFloor ? [] : quests}
              map={arena.hud?.map ?? null}
              onMenu={openMenu}
              onJournal={openJournal}
            />
          ) : (
            <FloorColumn
              dive={dive}
              biome={biome}
              hud={arena.hud}
              // One goal on screen: the tracked quests give way to a guided step.
              quests={guidedFloor ? [] : quests}
              onInspect={openItem}
              onJournal={openJournal}
            />
          )
        }
        dock={
          !choosing &&
          !finished && (
            <SkillDock
              hud={arena.hud}
              world={arena.worldRef}
              onCast={arena.cast}
              onDodge={arena.dodge}
              onPotion={arena.potion}
              onAttack={tapAttack}
              manualAttack={manualAttack}
            />
          )
        }
        centre={
          <>
            {/* Hesta's strip, under the top bar and over the boss's bar. */}
            {tutorial && guidedFloor && (
              <TutorialPanel
                state={tutorial}
                where={SHOWN_AT.floor}
                world={world}
                place="hud"
                onEvent={onTutorial}
              />
            )}
            <BossBar hud={arena.hud} />
          </>
        }
      />

      {banners[0] && <Banner key={banners[0].id} banner={banners[0]} onDone={popBanner} />}

      {choosing && !finished && (
        <div className="absolute inset-0 z-40" inert={!!pause}>
          <StopScreen
            dive={dive}
            haul={floorHaul}
            onChoose={onChooseDoor}
            onExtract={onExtract}
            onPotion={onDoorPotion}
            onMenu={openMenu}
            onInspect={openItem}
          />
        </div>
      )}

      {pause && (
        <div className="absolute inset-0 z-40" data-testid="dive-pause">
          <PauseScreen
            dive={dive}
            biome={biome}
            foesLeft={arena.hud?.monstersLeft ?? 0}
            roomsExplored={arena.hud?.map.floor?.explored}
            roomsTotal={arena.hud?.map.floor?.total}
            link={pause.link}
            atStop={choosing}
            onResume={resume}
            onAnvil={toAnvil}
            onAbandon={abandon}
            onSkipTutorial={profile.tutorial ? skipTutorial : undefined}
            onSkipStep={skippable ? skipStep : undefined}
          />
        </div>
      )}

      {exitAsk !== null && <ExitConfirm unexplored={exitAsk} onLeave={leave} onStay={stay} />}
      {alcove && <AlcoveDialog offers={alcove} onTake={takeAlcove} onClose={closeAlcove} />}

      {fallen && <RetryScreen onRetry={retry} onSkip={skipFallen} />}
      {finished && (
        <DiveSummary
          dive={dive}
          biomeName={biome.name}
          onCamp={onCamp}
          onAgain={profile.tutorial ? undefined : onAgain}
          againLabel={`Dive again from depth ${starts[starts.length - 1]}`}
        />
      )}
      {fanfares[0] && (
        <LegendaryFanfare
          item={fanfares[0].item}
          firstTime={fanfares[0].firstTime}
          onDone={popFanfare}
        />
      )}
      <ToastContainer />
    </div>
  );
}
