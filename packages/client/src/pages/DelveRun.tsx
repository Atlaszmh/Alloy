import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  chooseDoor,
  drinkPotionBetweenFloors,
  extractDive,
  startDepthOptions,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { ToastContainer, showToast } from '@/components/Toast';
import { getDelveRegistry } from '@/features/delve/registry';
import { DoorChoice } from '@/features/delve/DoorChoice';
import { DiveSummary } from '@/features/delve/DiveSummary';
import { LegendaryFanfare } from '@/features/delve/LegendaryFanfare';
import { ItemDetailSheet } from '@/features/delve/ItemDetailSheet';
import { LootTray } from '@/features/delve/LootTray';
import { PickupFeed } from '@/features/delve/arena/PickupFeed';
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
import { BossBar, SkillBar, TopHud, Vitals } from '@/features/delve/arena/ArenaHud';
import { useArena, type ArenaUiEvent } from '@/features/delve/arena/useArena';
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
    const anim = ref.current?.animate(
      [
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
        style={{ color: banner.color, textShadow: `0 0 24px ${banner.color}, 0 3px 0 #000` }}
      >
        {banner.title}
      </div>
      {banner.sub && (
        <div className="delve-display mt-1 text-sm font-semibold text-stone-100 drop-shadow">
          {banner.sub}
        </div>
      )}
    </div>
  );
}

const fineMouse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

export function DelveRun() {
  const navigate = useNavigate();
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const dive = profile.dive;

  const hostRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 70, bottom: 190 });
  const [sheetUid, setSheetUid] = useState<string | null>(null);
  const [fanfares, setFanfares] = useState<{ item: GearItem; firstTime: boolean }[]>([]);
  const [banners, setBanners] = useState<BannerState[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const bannerId = useRef(0);
  const lastNoMana = useRef(0);

  const showBanner = useCallback((title: string, color: string, sub?: string) => {
    setBanners((b) => [...b, { id: ++bannerId.current, title, sub, color }]);
  }, []);
  const popBanner = useCallback(() => setBanners((b) => b.slice(1)), []);
  const popFanfare = useCallback(() => setFanfares((f) => f.slice(1)), []);

  // Keep the camera clear of the HUD.
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      setInsets({
        top: topRef.current?.offsetHeight ?? 70,
        bottom: bottomRef.current?.offsetHeight ?? 190,
      });
    });
    if (topRef.current) ro.observe(topRef.current);
    if (bottomRef.current) ro.observe(bottomRef.current);
    return () => ro.disconnect();
  }, []);

  const arenaRef = useRef<ReturnType<typeof useArena> | null>(null);
  const onUi = useCallback(
    (e: ArenaUiEvent) => {
      switch (e.kind) {
        case 'events':
          for (const ev of e.events) {
            switch (ev.kind) {
              case 'hit':
                playSound(ev.crit ? 'crit' : 'attack');
                if (ev.crit) vibrate('light');
                break;
              case 'heroHit':
                playSound(ev.dodged ? 'dodge' : 'heroHurt');
                if (!ev.dodged) vibrate('light');
                break;
              case 'reaction':
                playSound('combineMerge');
                break;
              case 'explode':
                if (ev.radius >= 2.4) playSound('forgeSlam');
                break;
              case 'death':
                if (ev.monsterKind !== 'normal') playSound('death');
                break;
              case 'drop':
                if (ev.rarity === 'rare' || ev.rarity === 'epic') playSound('lootRare');
                else if (ev.dropKind === 'item') playSound('lootDrop');
                break;
              case 'pickup':
                if (ev.dropKind === 'item') playSound('dropSuccess');
                else if (ev.dropKind === 'orb') playSound('potion');
                break;
              case 'heal':
                if (ev.source === 'potion') playSound('potion');
                break;
              case 'revive':
                playSound('lootLegendary');
                vibrate('heavy');
                break;
              case 'heroDeath':
                playSound('defeat');
                vibrate('error');
                break;
              case 'cast':
                playSound('orbPlace');
                break;
              default:
                break;
            }
          }
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
          showBanner(
            `${def.icon} ${def.name.toUpperCase()}!`,
            '#e9d5ff',
            `Reaction discovered: ${def.text}`,
          );
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
        case 'noMana': {
          const now = performance.now();
          if (now - lastNoMana.current > 1500) {
            lastNoMana.current = now;
            const ab = arenaRef.current?.hud?.abilities[e.slot];
            showToast(ab ? `Not enough mana for ${ab.name}` : 'Not enough mana');
          }
          break;
        }
        case 'fell':
          break;
      }
    },
    [registry, showBanner],
  );

  const choosing = dive?.phase === 'choosing';
  const finished = dive?.phase === 'dead' || dive?.phase === 'extracted';
  const paused = !!sheetUid || fanfares.length > 0 || menuOpen || choosing || finished;
  const arena = useArena(hostRef, { paused, insets, onUi });
  arenaRef.current = arena;

  useEffect(() => {
    if (!dive) navigate('/delve', { replace: true });
  }, [dive, navigate]);

  if (!dive) return null;

  const biome = registry.getBiomeForDepth(dive.depth);
  const starts = startDepthOptions(registry, profile);

  const onChooseDoor = (doorId: string) => {
    const before = useDelveStore.getState().profile;
    const next = chooseDoor(registry, before, doorId);
    useDelveStore.getState().setProfile(next);
    if (next.bestDepth > before.bestDepth && before.bestDepth > 0) {
      showBanner('NEW RECORD', '#4ade80', `Deepest depth reached: ${next.bestDepth}`);
    }
  };
  const onExtract = () =>
    useDelveStore.getState().setProfile(extractDive(registry, useDelveStore.getState().profile));
  const onDoorPotion = () => {
    const next = drinkPotionBetweenFloors(registry, useDelveStore.getState().profile);
    if (next) {
      useDelveStore.getState().setProfile(next);
      playSound('potion');
    } else playSound('combineFail');
  };
  const onCamp = () => {
    useDelveStore.getState().closeDive();
    navigate('/delve');
  };
  const onAgain = () => {
    const s = useDelveStore.getState();
    s.closeDive();
    s.startDive(starts[starts.length - 1]);
    playSound('phaseTransition');
  };
  const openItem = (uid: string) => {
    useDelveStore.getState().markSeen([uid]);
    setSheetUid(uid);
  };

  return (
    <div className="delve-page select-none bg-black" data-testid="delve-run">
      <div ref={hostRef} className="absolute inset-0" data-testid="arena" />
      <ArenaControls
        input={arena.input}
        heroScreen={arena.heroScreen}
        pixelsPerUnit={arena.pixelsPerUnit}
        disabled={paused}
      />

      <TopHud
        ref={topRef}
        dive={dive}
        biome={biome}
        hud={arena.hud}
        onMenu={() => setMenuOpen((v) => !v)}
      />
      <BossBar hud={arena.hud} />
      {!choosing && !finished && (
        <PickupFeed onSelect={openItem} top={insets.top + (arena.hud?.boss ? 44 : 6)} />
      )}

      <div
        ref={bottomRef}
        className="absolute inset-x-0 bottom-0 z-20 px-3 pt-6"
        hidden={choosing || finished}
        style={{
          background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 55%, rgba(0,0,0,0))',
          paddingBottom: 'calc(10px + var(--spacing-safe-bottom))',
          pointerEvents: 'none',
        }}
      >
        <div className="pointer-events-auto mx-auto flex max-w-[520px] flex-col gap-2">
          <Vitals hud={arena.hud} />
          <SkillBar
            hud={arena.hud}
            onCast={arena.cast}
            onAim={arena.aim}
            onPotion={arena.potion}
            showKeys={!!fineMouse}
          />
        </div>
      </div>

      {banners[0] && <Banner key={banners[0].id} banner={banners[0]} onDone={popBanner} />}

      {menuOpen && (
        <div className="delve-panel absolute right-3 top-14 z-40 flex w-60 flex-col gap-1.5 p-2 shadow-xl">
          <button className="delve-btn text-sm" onClick={() => navigate('/delve')}>
            Back to the Anvil (floor restarts)
          </button>
          <button
            className="delve-btn delve-btn-danger text-sm"
            onClick={() => {
              setMenuOpen(false);
              onCamp();
            }}
          >
            Abandon dive (lose bounty)
          </button>
          <button className="delve-btn text-sm" onClick={() => setMenuOpen(false)}>
            Resume
          </button>
        </div>
      )}

      {choosing && (
        <div className="absolute inset-0 z-40 flex flex-col bg-black/80">
          <div className="relative min-h-0 flex-1">
            <DoorChoice dive={dive} onChoose={onChooseDoor} onExtract={onExtract} />
          </div>
          <div
            className="relative z-40 bg-black/70 pt-2"
            style={{ paddingBottom: 'calc(8px + var(--spacing-safe-bottom))' }}
          >
            <div className="delve-column mb-3 flex items-center justify-between">
              <span className="text-xs text-stone-400">
                Life {Math.round(dive.heroHpFrac * 100)}% · {dive.potions} 🧪
              </span>
              <button
                className="delve-btn px-3 py-1.5 text-xs"
                onClick={onDoorPotion}
                disabled={dive.potions <= 0 || dive.heroHpFrac >= 1}
                data-testid="door-potion"
              >
                🧪 Drink potion
              </button>
            </div>
            <LootTray originRef={hostRef} onSelect={openItem} />
          </div>
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
      {sheetUid && <ItemDetailSheet uid={sheetUid} onClose={() => setSheetUid(null)} />}
      <ToastContainer />
    </div>
  );
}
