import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { isDiveActive, profilePower, startDepthOptions } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { ToastContainer } from '@/components/Toast';
import { getDelveRegistry } from '@/features/delve/registry';
import { PaperDoll } from '@/features/delve/PaperDoll';
import { BagPanel } from '@/features/delve/BagPanel';
import { ForgePanel } from '@/features/delve/ForgePanel';
import { CodexPanel } from '@/features/delve/CodexPanel';
import { ItemDetailSheet } from '@/features/delve/ItemDetailSheet';
import { useCountUp } from '@/features/delve/useCountUp';
import { RARITY_COLOR, RARITY_LABEL, formatNumber } from '@/features/delve/format';
import '@/features/delve/delve.css';

type Tab = 'bag' | 'forge' | 'codex';

export function DelveCamp() {
  const navigate = useNavigate();
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const newCount = useDelveStore((s) => Object.keys(s.newUids).length);
  const [tab, setTab] = useState<Tab>('bag');
  const [selected, setSelected] = useState<string | null>(null);

  // A finished dive's summary was shown on the run screen — clear it here.
  useEffect(() => {
    const phase = profile.dive?.phase;
    if (phase === 'dead' || phase === 'extracted') useDelveStore.getState().closeDive();
  }, [profile.dive?.phase]);

  const power = useMemo(() => profilePower(registry, profile), [registry, profile]);
  const shownPower = useCountUp(power);
  const starts = startDepthOptions(registry, profile);
  const [start, setStart] = useState(starts[starts.length - 1]);
  const active = isDiveActive(profile);
  const codexFound = Object.keys(profile.codex).length;
  const codexTotal = registry.getDelveData().legendaries.length;
  const firstTime = profile.stats.dives === 0;

  const onDelve = () => {
    playSound('phaseTransition');
    vibrate('medium');
    if (!active) useDelveStore.getState().startDive(starts.includes(start) ? start : 1);
    navigate('/delve/run');
  };

  const openItem = (uid: string) => {
    playSound('orbSelect');
    useDelveStore.getState().markSeen([uid]);
    setSelected(uid);
  };

  return (
    <div className="delve-page page-enter" data-testid="delve-camp">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(212,120,40,0.18), transparent 60%)',
        }}
      />
      <div className="delve-embers" />

      <div className="relative min-h-0 flex-1 overflow-y-auto pb-6">
        <div className="delve-column flex flex-col gap-4 pt-4">
          {/* Header */}
          <header className="flex items-end justify-between">
            <div>
              <div className="delve-display text-xs font-semibold uppercase tracking-[0.3em] text-amber-500/80">
                The Anvil
              </div>
              <div className="delve-display flex items-baseline gap-2">
                <span className="text-4xl font-bold text-amber-300" data-testid="hero-power">
                  {formatNumber(shownPower)}
                </span>
                <span className="text-xs uppercase tracking-widest text-stone-400">Power</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs text-stone-300">
              <span data-testid="scrap-count">⚙ {formatNumber(profile.scrap)} scrap</span>
              <span>Deepest · {profile.bestDepth}</span>
              <span style={{ color: '#fb923c' }}>
                ★ {codexFound}/{codexTotal} legendaries
              </span>
            </div>
          </header>

          {firstTime && (
            <div
              className="delve-panel p-3 text-[13px] leading-relaxed text-stone-300"
              data-testid="delve-howto"
            >
              <div className="delve-display mb-1 text-sm font-bold uppercase tracking-widest text-amber-300">
                How to delve
              </div>
              <p>
                ⚔️ Your hero fights on their own. Tap <b className="text-orange-300">SLAM</b> when
                it glows.
              </p>
              <p>
                💎 Monsters drop gear. A green <b className="text-green-400">▲</b> means it's an
                upgrade. Tap it to equip.
              </p>
              <p>
                🚪 Between depths, push deeper or <b className="text-amber-300">extract</b> to bank
                your bounty. Die and you lose the bounty but keep every item.
              </p>
            </div>
          )}

          <PaperDoll onSelect={openItem} />

          {/* Delve CTA */}
          <div className="flex flex-col gap-2">
            {!active && starts.length > 1 && (
              <div
                className="flex flex-wrap items-center justify-center gap-1.5"
                data-testid="start-depths"
              >
                <span className="text-xs text-stone-500">Start at depth</span>
                {starts.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="delve-chip"
                    aria-pressed={start === d}
                    onClick={() => setStart(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            <button
              className="delve-btn delve-btn-gold py-4 text-2xl"
              onClick={onDelve}
              data-testid="delve-button"
            >
              {active
                ? `RESUME DIVE · DEPTH ${profile.dive!.depth}`
                : `DELVE ▸ DEPTH ${starts.includes(start) ? start : 1}`}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-xl bg-black/30 p-1" role="tablist">
            {(
              [
                ['bag', `Bag${newCount > 0 ? ` •${newCount}` : ''}`],
                ['forge', 'Forge'],
                ['codex', `Codex ${codexFound}/${codexTotal}`],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => {
                  setTab(id);
                  playSound('buttonClick');
                }}
                className="delve-display flex-1 rounded-lg py-2 text-sm font-bold uppercase tracking-wider"
                style={{
                  background:
                    tab === id ? 'linear-gradient(180deg,#2c2c3e,#1f1f2c)' : 'transparent',
                  color: tab === id ? '#fde68a' : '#8a8a9a',
                }}
                data-testid={`tab-${id}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'bag' && <BagPanel onSelect={openItem} />}
          {tab === 'forge' && <ForgePanel onSelect={openItem} />}
          {tab === 'codex' && <CodexPanel />}

          {/* Lifetime stats */}
          {profile.stats.dives > 0 && (
            <div className="delve-panel grid grid-cols-3 gap-2 p-3 text-center text-xs text-stone-400">
              <div>
                <div className="delve-display text-lg font-bold text-stone-200">
                  {profile.stats.dives}
                </div>
                dives
              </div>
              <div>
                <div className="delve-display text-lg font-bold text-stone-200">
                  {formatNumber(profile.stats.kills)}
                </div>
                kills
              </div>
              <div>
                <div className="delve-display text-lg font-bold text-stone-200">
                  {profile.stats.bossKills}
                </div>
                bosses
              </div>
              <div className="col-span-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
                {(['uncommon', 'magic', 'rare', 'epic', 'legendary'] as const).map((r) => (
                  <span key={r} style={{ color: RARITY_COLOR[r] }}>
                    {profile.stats.itemsFound[r]} {RARITY_LABEL[r]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && <ItemDetailSheet uid={selected} onClose={() => setSelected(null)} />}
      <ToastContainer />
    </div>
  );
}
