import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  chooseDoor,
  drinkPotionBetweenFloors,
  extractDive,
  startDepthOptions,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
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
import { HudGrid, type Insets } from '@/features/delve/arena/hud/HudGrid';
import { PurseBar } from '@/features/delve/arena/hud/PurseBar';
import { SkillDock } from '@/features/delve/arena/hud/SkillDock';
import { BossBar } from '@/features/delve/arena/hud/BossBar';
import { FloorColumn } from '@/features/delve/arena/hud/FloorColumn';
import { useQuests } from '@/features/delve/quests/useQuests';
import { StopScreen } from '@/features/delve/stop/StopScreen';
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
  const [banners, setBanners] = useState<BannerState[]>([]);
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
      }
    },
    [registry, showBanner, noManaToast],
  );

  const choosing = dive?.phase === 'choosing';
  const finished = dive?.phase === 'dead' || dive?.phase === 'extracted';
  const paused = !!pause || fanfares.length > 0 || choosing || finished;
  // A layout effect, so the controller switches owner in the same commit as the
  // pause or resume: a press right after resuming reaches the fight, not the menus.
  useLayoutEffect(() => {
    setArenaLive(!paused);
    return () => setArenaLive(false);
  }, [paused]);
  const manualAttack = useDelveStore((s) => s.manualAttack);
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
  const toAnvil = useCallback(() => navigate('/delve'), [navigate]);
  const abandon = useCallback(() => {
    setPause(null);
    onCamp();
  }, [onCamp]);

  if (!dive) return null;

  const biome = registry.getBiomeForDepth(dive.depth);
  const starts = startDepthOptions(registry, profile);

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

      <HudGrid
        onInsets={setInsets}
        inert={!!pause || choosing}
        top={<PurseBar dive={dive} onMenu={openMenu} onJournal={openJournal} />}
        right={
          <FloorColumn
            dive={dive}
            biome={biome}
            hud={arena.hud}
            quests={quests}
            onInspect={openItem}
            onJournal={openJournal}
          />
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
      >
        <BossBar hud={arena.hud} />
      </HudGrid>

      {banners[0] && <Banner key={banners[0].id} banner={banners[0]} onDone={popBanner} />}

      {choosing && (
        <div className="absolute inset-0 z-40" inert={!!pause}>
          <StopScreen
            dive={dive}
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
            link={pause.link}
            atStop={choosing}
            onResume={resume}
            onAnvil={toAnvil}
            onAbandon={abandon}
          />
        </div>
      )}

      {finished && (
        <DiveSummary
          dive={dive}
          biomeName={biome.name}
          onCamp={onCamp}
          onAgain={onAgain}
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
