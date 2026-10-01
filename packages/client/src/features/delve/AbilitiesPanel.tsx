import { useMemo } from 'react';
import {
  CHAIN_SKILLS,
  MANA_TYPES,
  baseSlots,
  carriedByText,
  heroChains,
  isDiveActive,
  manaPool,
  movesetOf,
  pairElements,
  profileStats,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from './registry';
import { manaStyle } from './format';
import { ManaPanel } from './ManaPanel';
import { ChainEditor } from './chains/ChainEditor';

/** Attunement per element (all six, or just `elements`) with the mastery threshold, and the one mana pool it feeds. */
export function AttunementBars({
  stats,
  elements = MANA_TYPES,
}: {
  stats: HeroStats;
  elements?: readonly ManaType[];
}) {
  const registry = getDelveRegistry();
  const bal = registry.getDelveBalance().mana;
  const masteries = registry.getArpgData().masteries;
  const attunement = stats.attunement;
  const scale = Math.max(bal.masteryThreshold + 2, ...elements.map((m) => attunement[m] + 1));
  const pool = manaPool(stats, registry);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-stone-400" data-testid="mana-pool">
        Mana pool <b className="text-indigo-300">{Math.round(pool.max)}</b> · +
        {pool.regen.toFixed(1)}/s · every point of attunement adds {bal.poolPerAttune}
      </div>
      {elements.map((m) => {
        const style = manaStyle(registry, m);
        const a = attunement[m];
        const mastery = masteries.find((x) => x.mana === m);
        const mastered = a >= bal.masteryThreshold;
        return (
          <div key={m} className="flex flex-col gap-0.5" data-testid={`attune-${m}`} data-value={a}>
            <div className="flex items-center gap-2">
              <span className="w-5 text-center text-sm leading-none">{style.icon}</span>
              <span
                className="delve-display w-14 text-xs font-bold"
                style={{ color: a > 0 ? style.color : '#57534e' }}
              >
                {style.name}
              </span>
              <div className="relative h-2.5 flex-1 overflow-visible rounded-full bg-white/5">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min(1, a / scale) * 100}%`,
                    background: style.color,
                    boxShadow: a > 0 ? `0 0 8px ${style.color}88` : undefined,
                  }}
                />
                <span
                  className="absolute -top-0.5 h-3.5 w-0.5 rounded"
                  style={{
                    left: `${(bal.masteryThreshold / scale) * 100}%`,
                    background: mastered ? '#fff' : 'rgba(255,255,255,0.25)',
                  }}
                />
              </div>
              <span className="delve-display w-6 text-right text-sm font-bold text-stone-100">
                {a}
              </span>
            </div>
            <div className="pl-7 text-[10px] leading-snug text-stone-500">
              {a > 0 && (
                <span className="text-stone-400">
                  +{Math.round(a * bal.powerPerAttune * 100)}% to {style.name} abilities ·{' '}
                </span>
              )}
              {mastery &&
                (mastered ? (
                  <span style={{ color: style.color }}>
                    ★ {mastery.name}: {mastery.text}
                  </span>
                ) : (
                  <span>
                    At {bal.masteryThreshold}: {mastery.name}
                  </span>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Chip({
  pressed,
  onClick,
  children,
  testId,
  title,
  disabled,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="delve-chip"
      aria-pressed={pressed}
      onClick={onClick}
      data-testid={testId}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/**
 * The Anvil's workshop: the equipped weapon's chains from your two elements,
 * each change applied as it is made, and your Mana view; read-only while a
 * dive is under way, and unarmed (the unarmed default shows).
 */
export function AbilitiesPanel() {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const chains = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  // Unarmed, the default chains sit at their base slots (the bare hands' string for the basic one).
  const slots = weapon
    ? movesetOf(registry, weapon).slots
    : Object.fromEntries(
        CHAIN_SKILLS.filter((s) => chains[s]).map((s) => [s, baseSlots(registry, null, s)]),
      );
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [equipped, pair, registry],
  );
  const elements = pairElements(pair);
  return (
    <ChainEditor
      chains={chains}
      caps={slots}
      stats={stats}
      reactionsSeen={profile.reactionsSeen}
      locked={isDiveActive(profile) || !weapon}
      absentText={(s) => carriedByText(registry, s)}
      onChange={(skill, chain) => useDelveStore.getState().setChains({ [skill]: chain })}
      elements={elements.length > 0 ? elements : undefined}
      mana={<ManaPanel stats={stats} />}
    />
  );
}
