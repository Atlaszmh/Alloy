import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  chooseDoor,
  computeHeroStats,
  extractDive,
  isBossDepth,
  profilePower,
  startDepthOptions,
  type FightEvent,
  type FightOutcome,
  type FightState,
  type GearItem,
  type MonsterInstance,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { ToastContainer, showToast } from '@/components/Toast';
import { getDelveRegistry } from '@/features/delve/registry';
import { useDiveController, type DiveHud } from '@/features/delve/useDiveController';
import { LootTray } from '@/features/delve/LootTray';
import { DoorChoice } from '@/features/delve/DoorChoice';
import { DiveSummary } from '@/features/delve/DiveSummary';
import { LegendaryFanfare } from '@/features/delve/LegendaryFanfare';
import { ItemDetailSheet } from '@/features/delve/ItemDetailSheet';
import { RARITY_COLOR, formatNumber } from '@/features/delve/format';
import { useCountUp } from '@/features/delve/useCountUp';
import * as fx from '@/features/delve/delve-fx';
import '@/features/delve/delve.css';

const ELEMENT_COLOR = { fire: '#fb923c', cold: '#7dd3fc', lightning: '#fde047' } as const;

interface BannerState {
  id: number;
  title: string;
  sub?: string;
  color: string;
}

function hpColor(frac: number): string {
  if (frac > 0.6) return 'linear-gradient(180deg,#4ade80,#16a34a)';
  if (frac > 0.3) return 'linear-gradient(180deg,#facc15,#ca8a04)';
  return 'linear-gradient(180deg,#f87171,#b91c1c)';
}

function HpBar({
  value,
  max,
  color,
  testId,
}: {
  value: number;
  max: number;
  color: string;
  testId?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="delve-hpbar" data-testid={testId}>
      <div className="lag" style={{ width: `${pct}%` }} />
      <div className="fill" style={{ width: `${pct}%`, background: color }} />
      <div className="text">
        {formatNumber(Math.max(0, value))} / {formatNumber(max)}
      </div>
    </div>
  );
}

function Banner({ banner, onDone }: { banner: BannerState; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anim = ref.current?.animate(
      [
        { transform: 'scale(2.4)', opacity: 0 },
        { transform: 'scale(0.95)', opacity: 1, offset: 0.18 },
        { transform: 'scale(1)', opacity: 1, offset: 0.75 },
        { transform: 'scale(1.05)', opacity: 0 },
      ],
      { duration: 1500, easing: 'ease-out' },
    );
    const done = () => onDone();
    anim?.finished.then(done, done);
    return () => anim?.cancel();
  }, [banner.id, onDone]);
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-0 top-[28%] z-30 text-center"
      data-testid="delve-banner"
    >
      <div
        className="delve-display text-4xl font-bold tracking-[0.15em]"
        style={{ color: banner.color, textShadow: `0 0 24px ${banner.color}, 0 3px 0 #000` }}
      >
        {banner.title}
      </div>
      {banner.sub && (
        <div className="delve-display mt-1 text-sm font-semibold text-stone-200">{banner.sub}</div>
      )}
    </div>
  );
}

function SlamButton({
  hud,
  onSlam,
  autoSlam,
}: {
  hud: DiveHud | null;
  onSlam: () => void;
  autoSlam: boolean;
}) {
  const charge = hud ? hud.slamCharge / hud.slamMax : 0;
  const ready = charge >= 1;
  return (
    <button
      type="button"
      className={`delve-slam-btn ${ready ? 'ready' : ''}`}
      onClick={onSlam}
      disabled={!ready}
      aria-label="Slam"
      data-testid="slam-button"
      style={{
        background: `conic-gradient(${ready ? '#fb923c' : '#d4a834'} ${charge * 360}deg, rgba(255,255,255,0.08) 0deg)`,
        padding: 4,
      }}
    >
      <span
        className="flex h-full w-full flex-col items-center justify-center rounded-full"
        style={{
          background: ready
            ? 'radial-gradient(circle at 50% 35%, #fdba74, #c2410c)'
            : 'radial-gradient(circle at 50% 35%, #2a2a3a, #15151f)',
          color: ready ? '#fff' : '#8a8a9a',
        }}
      >
        SLAM
        <span className="text-[9px] font-semibold opacity-75">
          {autoSlam ? 'AUTO' : ready ? 'READY' : `${hud?.slamCharge ?? 0}/${hud?.slamMax ?? 0}`}
        </span>
      </span>
    </button>
  );
}

/** Live hero Power that counts up (and flashes) when gear improves mid-dive. */
function PowerPill() {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const power = useMemo(() => profilePower(registry, profile), [registry, profile]);
  const shown = useCountUp(power);
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(power);
  useEffect(() => {
    if (power > prev.current) {
      ref.current?.animate(
        [
          { transform: 'scale(1)', color: '#fde68a' },
          { transform: 'scale(1.25)', color: '#4ade80', offset: 0.3 },
          { transform: 'scale(1)', color: '#fde68a' },
        ],
        { duration: 700, easing: 'ease-out' },
      );
    }
    prev.current = power;
  }, [power]);
  return (
    <div className="delve-column -mb-1 flex justify-end">
      <div
        ref={ref}
        className="delve-display text-xs font-bold tracking-wider"
        style={{ color: '#fde68a' }}
        data-testid="run-power"
      >
        ⚡ {formatNumber(shown)} POWER
      </div>
    </div>
  );
}

function MonsterPortrait({
  monster,
  innerRef,
  accent,
}: {
  monster: MonsterInstance;
  innerRef: React.RefObject<HTMLDivElement | null>;
  accent: string;
}) {
  const boss = monster.kind === 'boss';
  const elite = monster.kind === 'elite';
  useLayoutEffect(() => {
    fx.monsterEnter(innerRef.current, boss);
  }, [monster, boss, innerRef]);
  const glow = boss ? '#ef4444' : elite ? '#facc15' : accent;
  return (
    <div
      className="delve-monster"
      style={{ fontSize: boss ? 'clamp(110px, 21vh, 190px)' : 'clamp(84px, 16vh, 150px)' }}
    >
      <div
        ref={innerRef}
        data-testid="monster"
        style={{
          filter: `drop-shadow(0 0 ${boss ? 30 : 18}px ${glow}) drop-shadow(0 12px 10px rgba(0,0,0,0.7))`,
        }}
      >
        {monster.icon}
      </div>
    </div>
  );
}

export function DelveRun() {
  const navigate = useNavigate();
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const speed = useDelveStore((s) => s.speed);
  const autoSlam = useDelveStore((s) => s.autoSlam);
  const dive = profile.dive;

  const [sheetUid, setSheetUid] = useState<string | null>(null);
  const [fanfare, setFanfare] = useState<{ item: GearItem; firstTime: boolean } | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fightKey, setFightKey] = useState(0);
  const bannerId = useRef(0);
  const closeBanner = useCallback(() => setBanner(null), []);
  const closeFanfare = useCallback(() => setFanfare(null), []);

  const pageRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const monsterRef = useRef<HTMLDivElement>(null);
  const heroBarRef = useRef<HTMLDivElement>(null);
  const heroHudRef = useRef<HTMLDivElement>(null);

  const biome = registry.getBiomeForDepth(dive?.depth ?? 1);

  const showBanner = useCallback((title: string, color: string, sub?: string) => {
    setBanner({ id: ++bannerId.current, title, sub, color });
  }, []);

  // ── Event → effect mapping ──────────────────────────────────────────
  const onEvents = useCallback((events: FightEvent[], fight: FightState) => {
    const layer = fxRef.current;
    if (!layer) return;
    const mon = monsterRef.current;
    const monAt = fx.centerIn(layer, mon, 0.45);
    const heroAt = fx.centerIn(layer, heroBarRef.current, 0.5);
    let budget = 14;
    for (const e of events) {
      switch (e.kind) {
        case 'hit': {
          if (e.source === 'hero') {
            const tint = e.element ? ELEMENT_COLOR[e.element] : e.crit ? '#fde047' : '#f5f5f4';
            if (budget > 0) {
              fx.slash(layer, monAt, e.element ? ELEMENT_COLOR[e.element] : '#e7e5e4', e.crit);
              fx.floatText(
                layer,
                { x: monAt.x, y: monAt.y - 36 },
                `${formatNumber(e.amount)}${e.crit ? '!' : ''}`,
                {
                  color: tint,
                  size: e.crit ? 38 : e.extra ? 18 : 26,
                  pop: e.crit,
                },
              );
              budget -= 2;
            }
            fx.flash(mon);
            fx.knock(mon, (Math.random() - 0.5) * 16, -5);
            playSound(e.crit ? 'crit' : 'attack');
            if (e.crit) {
              vibrate('light');
              fx.shake(stageRef.current, 4, 180);
            }
          } else {
            fx.lunge(mon);
            if (e.dodged) {
              fx.floatText(layer, heroAt, 'DODGE', { color: '#67e8f9', size: 18, jitter: 10 });
              playSound('dodge');
            } else if (e.blocked) {
              fx.floatText(layer, heroAt, 'BLOCKED', { color: '#fcd34d', size: 18, jitter: 10 });
              playSound('block');
            } else {
              fx.floatText(layer, { x: heroAt.x, y: heroAt.y - 12 }, `-${formatNumber(e.amount)}`, {
                color: '#f87171',
                size: 22,
                jitter: 40,
              });
              fx.shake(heroHudRef.current, 5);
              fx.vignette(
                pageRef.current,
                '#ff0000',
                Math.min(0.85, 0.3 + (e.amount / fight.hero.maxHp) * 3),
              );
              playSound('heroHurt');
              vibrate('light');
            }
          }
          break;
        }
        case 'burn':
          if (budget-- > 0)
            fx.floatText(layer, monAt, formatNumber(e.amount), {
              color: '#fb923c',
              size: 15,
              jitter: 50,
              rise: 30,
            });
          break;
        case 'chill':
          fx.floatText(layer, { x: monAt.x, y: monAt.y + 40 }, '❄ CHILLED', {
            color: '#7dd3fc',
            size: 14,
            jitter: 10,
          });
          break;
        case 'thorns':
          if (e.source === 'hero') {
            if (budget-- > 0)
              fx.floatText(layer, monAt, formatNumber(e.amount), {
                color: '#c084fc',
                size: 16,
                jitter: 40,
              });
          } else {
            fx.floatText(layer, heroAt, `-${formatNumber(e.amount)}`, {
              color: '#c084fc',
              size: 16,
              jitter: 30,
            });
          }
          break;
        case 'heal':
          if (e.amount < 1) break;
          if (e.target === 'hero') {
            const potion = e.source === 'potion';
            fx.floatText(layer, { x: heroAt.x, y: heroAt.y - 20 }, `+${formatNumber(e.amount)}`, {
              color: '#4ade80',
              size: potion ? 26 : 15,
              pop: potion,
              jitter: potion ? 0 : 40,
            });
            if (potion) {
              playSound('potion');
              fx.ring(layer, heroAt, '#4ade80', 160);
            }
          } else if (budget-- > 0) {
            fx.floatText(layer, monAt, `+${formatNumber(e.amount)}`, {
              color: '#86efac',
              size: 14,
              jitter: 40,
            });
          }
          break;
        case 'slam':
          fx.ring(layer, monAt, '#fb923c', 280);
          fx.slash(layer, monAt, '#fb923c', true);
          fx.floatText(layer, { x: monAt.x, y: monAt.y - 50 }, `${formatNumber(e.amount)}!!`, {
            color: e.crit ? '#fde047' : '#fdba74',
            size: 48,
            pop: true,
            jitter: 0,
            duration: 1100,
          });
          fx.flash(mon, 'brightness(4) saturate(0)', 220);
          fx.shake(pageRef.current, 12, 380);
          playSound('forgeSlam');
          vibrate('heavy');
          break;
        case 'revive':
          fx.ring(layer, heroAt, '#fb923c', 240);
          fx.floatText(layer, { x: heroAt.x, y: heroAt.y - 70 }, 'REBORN!', {
            color: '#fb923c',
            size: 38,
            pop: true,
            jitter: 0,
          });
          playSound('lootLegendary');
          vibrate('heavy');
          break;
        case 'death':
          break;
      }
    }
  }, []);

  const onFightStart = useCallback(
    (fight: FightState) => {
      setFightKey((k) => k + 1);
      if (fight.monster.kind === 'boss') {
        showBanner('BOSS', '#ef4444', fight.monster.name);
        playSound('roundStart');
        vibrate('medium');
        window.setTimeout(() => fx.shake(pageRef.current, 10, 420), 250);
      } else if (fight.monster.kind === 'elite') {
        showBanner('ELITE', '#facc15', fight.monster.name);
      }
    },
    [showBanner],
  );

  const onResolved = useCallback(
    (outcome: FightOutcome) => {
      const layer = fxRef.current;
      const store = useDelveStore.getState();
      if (!layer) return;
      const monAt = fx.centerIn(layer, monsterRef.current, 0.45);

      if (!outcome.victory) {
        fx.shake(pageRef.current, 14, 520);
        fx.vignette(pageRef.current, '#ff0000', 0.95);
        playSound('defeat');
        vibrate('error');
        return;
      }

      const boss = outcome.monster.kind === 'boss';
      fx.monsterDeath(monsterRef.current);
      fx.shards(layer, monAt, biome.accent, boss ? 26 : 12);
      if (boss) {
        fx.ring(layer, monAt, '#fde68a', 340);
        fx.shake(pageRef.current, 10, 500);
      }
      playSound(boss ? 'forgeSlam' : 'death');

      const uids = outcome.drops.map((d) => d.uid);
      store.pushDiveDrops(uids);
      store.markNew(uids);

      outcome.drops.forEach((d, i) => {
        if (d.rarity === 'rare' || d.rarity === 'epic' || d.rarity === 'legendary') {
          window.setTimeout(
            () =>
              fx.beam(
                layer,
                { x: monAt.x + (i - (outcome.drops.length - 1) / 2) * 34, y: monAt.y },
                RARITY_COLOR[d.rarity],
              ),
            i * 110,
          );
        }
      });

      const all = [...outcome.drops, ...outcome.salvaged];
      const legendary =
        outcome.drops.find((d) => d.rarity === 'legendary') ??
        outcome.salvaged.find((d) => d.rarity === 'legendary');
      if (legendary) {
        playSound('lootLegendary');
        vibrate('heavy');
        const firstTime =
          !!legendary.legendary && outcome.newCodex.includes(legendary.legendary.id);
        window.setTimeout(() => setFanfare({ item: legendary, firstTime }), 650);
      } else if (all.some((d) => d.rarity === 'rare' || d.rarity === 'epic')) {
        playSound('lootRare');
        vibrate('success');
      } else if (all.length > 0) {
        playSound('lootDrop');
      }

      if (outcome.scrap > 0) {
        fx.floatText(layer, { x: monAt.x, y: monAt.y + 50 }, `+${formatNumber(outcome.scrap)} ⚙`, {
          color: '#fcd34d',
          size: 16,
          jitter: 0,
          duration: 1100,
        });
      }
      if (outcome.bagFull) showToast('Bag full: extra loot was salvaged');

      if (boss) {
        const next = useDelveStore.getState().profile.dive?.depth ?? 0;
        showBanner('BOSS SLAIN', '#fde68a', `Checkpoint unlocked: start at depth ${next + 1}`);
      }
    },
    [biome.accent, showBanner],
  );

  const paused = !!sheetUid || !!fanfare || menuOpen;
  const ctrl = useDiveController({ onEvents, onFightStart, onResolved }, paused);

  // No dive → back to camp.
  useEffect(() => {
    if (!dive) navigate('/delve', { replace: true });
  }, [dive, navigate]);

  // Desktop shortcuts: Space = slam, Q = potion.
  const ctrlRef = useRef(ctrl);
  ctrlRef.current = ctrl;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        ctrlRef.current.slam();
      } else if (ev.key === 'q' || ev.key === 'Q') {
        ctrlRef.current.potion();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!dive) return null;

  const heroStats = computeHeroStats(profile.equipped, registry);
  const hud = ctrl.hud;
  const heroHp = ctrl.stage === 'choosing' || !hud ? dive.heroHpFrac * heroStats.maxHp : hud.heroHp;
  const heroMax = ctrl.stage === 'choosing' || !hud ? heroStats.maxHp : hud.heroMax;
  const monster = ctrl.monster;
  const showMonster =
    monster && (ctrl.stage === 'approach' || ctrl.stage === 'fighting' || ctrl.stage === 'looting');
  const bossDepth = isBossDepth(registry, dive.depth);
  const starts = startDepthOptions(registry, profile);

  const onChooseDoor = (doorId: string) => {
    const before = useDelveStore.getState().profile;
    const next = chooseDoor(registry, before, doorId);
    useDelveStore.getState().setProfile(next);
    if (next.bestDepth > before.bestDepth && before.bestDepth > 0) {
      showBanner('NEW RECORD', '#4ade80', `Deepest depth reached: ${next.bestDepth}`);
      playSound('synergyActivate');
    }
  };
  const onExtract = () => {
    useDelveStore.getState().setProfile(extractDive(registry, useDelveStore.getState().profile));
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
  const onPotion = () => {
    if (!ctrl.potion()) playSound('combineFail');
  };
  const onSlam = () => {
    ctrl.slam();
  };
  const openItem = (uid: string) => {
    useDelveStore.getState().markSeen([uid]);
    setSheetUid(uid);
  };

  return (
    <div
      ref={pageRef}
      className="delve-page"
      style={{
        background: `linear-gradient(180deg, ${biome.colors[0]} 0%, ${biome.colors[1]} 70%, #050507 100%)`,
      }}
      data-testid="delve-run"
    >
      {/* Top bar */}
      <div className="delve-column relative z-10 flex items-center gap-2 pt-2">
        <div className="min-w-0 flex-1">
          <div className="delve-display text-2xl font-bold leading-none" data-testid="depth-label">
            DEPTH {dive.depth}
          </div>
          <div
            className="delve-display text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: biome.accent }}
          >
            {biome.name}
            {dive.door && dive.door.id !== 'winding' ? ` · ${dive.door.name}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1.5" aria-label="Encounters">
          {Array.from({ length: dive.encountersInDepth }).map((_, i) => {
            const isBoss = bossDepth && i === dive.encountersInDepth - 1;
            const done = i < dive.encounterIndex || dive.phase === 'choosing';
            const current = i === dive.encounterIndex && dive.phase === 'fighting';
            return (
              <span
                key={i}
                className="flex items-center justify-center rounded-full"
                style={{
                  width: isBoss ? 18 : 10,
                  height: isBoss ? 18 : 10,
                  fontSize: 11,
                  background: done
                    ? '#d4a834'
                    : current
                      ? 'rgba(255,255,255,0.85)'
                      : 'rgba(255,255,255,0.15)',
                  boxShadow: current ? '0 0 8px #fff' : undefined,
                }}
              >
                {isBoss ? '☠' : ''}
              </span>
            );
          })}
        </div>
        <div className="flex flex-col items-end">
          <span className="delve-display text-base font-bold text-amber-300" data-testid="bounty">
            ⚙ {formatNumber(dive.bounty)}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-stone-400">bounty</span>
        </div>
        <button
          className="delve-btn ml-1 px-2.5 py-1.5 text-sm"
          aria-label="Dive menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="delve-panel absolute right-3 top-12 z-40 flex w-56 flex-col gap-1.5 p-2 shadow-xl">
            <button className="delve-btn text-sm" onClick={() => navigate('/delve')}>
              Back to the Anvil (dive saved)
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
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: `${biome.accent}22` }}
        />
        {showMonster && monster && (
          <div className="relative flex w-full flex-col items-center gap-2">
            <div className="delve-column flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                {monster.kind !== 'normal' && (
                  <span
                    className="delve-display rounded px-1.5 py-0.5 text-[10px] font-bold tracking-widest"
                    style={{
                      background: monster.kind === 'boss' ? '#7f1d1d' : '#713f12',
                      color: monster.kind === 'boss' ? '#fecaca' : '#fde68a',
                    }}
                  >
                    {monster.kind === 'boss' ? 'BOSS' : 'ELITE'}
                  </span>
                )}
                <span className="delve-display text-lg font-bold" data-testid="monster-name">
                  {monster.name}
                </span>
                {hud?.burning && <span title="Burning">🔥</span>}
                {hud?.chilled && <span title="Chilled">❄️</span>}
                {hud?.enraged && (
                  <span
                    className="delve-display text-[10px] font-bold text-red-400"
                    title="Enraged: damage doubling"
                  >
                    ENRAGED
                  </span>
                )}
              </div>
              <div className="w-full max-w-[320px]">
                <HpBar
                  value={hud?.monsterHp ?? monster.maxHp}
                  max={hud?.monsterMax ?? monster.maxHp}
                  color="linear-gradient(180deg,#ef4444,#991b1b)"
                  testId="monster-hp"
                />
              </div>
              {monster.traits.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1">
                  {monster.traits.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] text-stone-300"
                      title={registry.getDelveData().traits.find((d) => d.id === t)?.text}
                    >
                      {registry.getDelveData().traits.find((d) => d.id === t)?.name ?? t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2">
              <MonsterPortrait
                key={fightKey}
                monster={monster}
                innerRef={monsterRef}
                accent={biome.accent}
              />
            </div>
          </div>
        )}
        {banner && <Banner banner={banner} onDone={closeBanner} />}
        {ctrl.stage === 'choosing' && dive.phase === 'choosing' && (
          <DoorChoice dive={dive} onChoose={onChooseDoor} onExtract={onExtract} />
        )}
      </div>

      {/* Hero HUD */}
      <div ref={heroHudRef} className="delve-column relative z-10 flex flex-col gap-2 pb-2">
        <div ref={heroBarRef}>
          <HpBar
            value={heroHp}
            max={heroMax}
            color={hpColor(heroHp / Math.max(1, heroMax))}
            testId="hero-hp"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            className="delve-btn flex h-14 w-20 flex-col items-center justify-center gap-0 px-2 py-1"
            onClick={onPotion}
            disabled={dive.potions <= 0 || dive.phase === 'dead' || dive.phase === 'extracted'}
            aria-label="Drink potion"
            data-testid="potion-button"
          >
            <span className="text-xl leading-none">🧪</span>
            <span className="delve-display text-xs">×{dive.potions}</span>
          </button>
          <SlamButton hud={hud} onSlam={onSlam} autoSlam={autoSlam} />
          <div className="flex w-20 flex-col gap-1.5">
            <button
              className="delve-chip whitespace-nowrap px-2 text-center text-xs"
              onClick={() => useDelveStore.getState().cycleSpeed()}
              aria-label={`Playback speed ${speed}x`}
              data-testid="speed-button"
            >
              ⏩ {speed}×
            </button>
            <button
              className="delve-chip whitespace-nowrap px-2 text-center text-xs"
              aria-pressed={autoSlam}
              aria-label="Auto-slam"
              onClick={() => useDelveStore.getState().toggleAutoSlam()}
              data-testid="autoslam-button"
            >
              AUTO
            </button>
          </div>
        </div>
      </div>

      <PowerPill />
      <LootTray originRef={monsterRef} onSelect={openItem} />

      {/* FX overlay covers the whole page so numbers can land on HUD and stage alike */}
      <div ref={fxRef} className="delve-fx-layer" />

      {(dive.phase === 'dead' || dive.phase === 'extracted') &&
        (ctrl.stage === 'dead' || ctrl.stage === 'extracted') && (
          <DiveSummary
            dive={dive}
            biomeName={biome.name}
            onCamp={onCamp}
            onAgain={onAgain}
            againLabel={`Dive again from depth ${starts[starts.length - 1]}`}
          />
        )}
      {fanfare && (
        <LegendaryFanfare item={fanfare.item} firstTime={fanfare.firstTime} onDone={closeFanfare} />
      )}
      {sheetUid && <ItemDetailSheet uid={sheetUid} onClose={() => setSheetUid(null)} />}
      <ToastContainer />
    </div>
  );
}
