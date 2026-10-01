import { useMemo, useState } from 'react';
import {
  CHAIN_SKILLS,
  MANA_TYPES,
  baseSlots,
  carriedByText,
  editPrice,
  heroChains,
  isDiveActive,
  manaPool,
  movesetOf,
  pairElements,
  profileStats,
  slotPrice,
  type ChainSkill,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { draftChanges, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';
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
 * The Anvil's workshop: the equipped weapon's chains, edited as a draft (kept
 * in the store, so it outlives the tab) whose price shows (free until the
 * first dive) and which Apply pays for, all or nothing, or Revert drops; each
 * chain's slots, with Add slot's price; and your Mana view. Read-only while a
 * dive is under way, and unarmed (the unarmed default shows).
 */
export function AbilitiesPanel() {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const draft = useDelveStore((s) => s.chainDraft);
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const [message, setMessage] = useState<string | null>(null);
  const saved = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  // The skills whose draft differs from the weapon's, and the chains shown.
  const changed = useMemo(() => draftChanges(registry, profile, draft), [registry, profile, draft]);
  const chains = useMemo(() => ({ ...saved, ...changed }), [saved, changed]);
  // Unarmed, the default chains sit at their base slots (the bare hands' string for the basic one).
  const slots = weapon
    ? movesetOf(registry, weapon).slots
    : Object.fromEntries(
        CHAIN_SKILLS.filter((s) => chains[s]).map((s) => [s, baseSlots(registry, null, s)]),
      );
  const stats = useMemo(
    () =>
      profileStats(registry, {
        pair,
        equipped: weapon
          ? {
              ...equipped,
              weapon: { ...weapon, moveset: { ...movesetOf(registry, weapon), chains } },
            }
          : equipped,
      }),
    [registry, equipped, pair, weapon, chains],
  );
  const elements = pairElements(pair);
  const locked = isDiveActive(profile) || !weapon;
  const pending = Object.keys(changed).length > 0;
  const price = pending ? editPrice(registry, profile, changed) : 0;
  const cap = registry.getDelveBalance().chains.cap;

  const onApply = () => {
    const res = useDelveStore.getState().applyDraft();
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    setMessage(res.ok ? null : (res.reason ?? 'Cannot apply'));
  };
  const onAddSlot = (skill: ChainSkill) => {
    const res = useDelveStore.getState().addSlot(skill);
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    setMessage(res.ok ? null : (res.reason ?? 'Cannot add a slot'));
  };

  const slotRow = (skill: ChainSkill) => {
    const next = weapon ? slotPrice(registry, weapon, skill) : null;
    // Why Add slot is off (none while a dive locks the whole builder).
    const why = !next
      ? null
      : changed[skill]
        ? 'Apply or revert this chain first'
        : profile.links < next.links
          ? 'Not enough Links'
          : profile.scrap < next.scrap
            ? 'Not enough scrap'
            : null;
    return (
      <div
        className="flex flex-wrap items-center gap-2 text-xs text-stone-400"
        data-testid="slot-row"
      >
        <span data-testid="chain-slots">
          Slots {slots[skill]}/{cap[skill]}
        </span>
        {next && (
          <button
            type="button"
            className="delve-chip"
            disabled={locked || !!why}
            onClick={() => onAddSlot(skill)}
            data-testid="add-slot"
          >
            + Add slot · 🔗 {next.links} · ⚙ {formatNumber(next.scrap)}
          </button>
        )}
        {why && !locked && (
          <span className="text-amber-200/80" data-testid="add-slot-why">
            {why}
          </span>
        )}
        <span>
          🔗 {profile.links} Link{profile.links === 1 ? '' : 's'} · ⚙ {formatNumber(profile.scrap)}{' '}
          scrap
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {pending && (
        <div
          className="delve-panel flex flex-wrap items-center gap-2 p-2"
          data-testid="chain-draft"
        >
          <span className="flex-1 text-xs text-stone-300" data-testid="chain-price">
            {profile.stats.dives === 0
              ? 'Changes are free until your first dive'
              : `Changes cost ✦ ${price} Mana Dust (you have ✦ ${formatNumber(profile.manaDust)})`}
          </span>
          <button
            type="button"
            className="delve-btn px-3 py-1 text-xs"
            onClick={() => {
              useDelveStore.getState().revertDraft();
              setMessage(null);
            }}
            data-testid="chain-revert"
          >
            Revert
          </button>
          <button
            type="button"
            className="delve-btn delve-btn-gold px-3 py-1 text-xs"
            disabled={price > profile.manaDust}
            onClick={onApply}
            data-testid="chain-apply"
          >
            Apply{price > 0 ? ` · ✦ ${price}` : ''}
          </button>
        </div>
      )}
      {message && (
        <div
          className="text-xs font-semibold text-red-300"
          role="status"
          data-testid="chain-message"
        >
          {message}
        </div>
      )}
      <ChainEditor
        chains={chains}
        caps={slots}
        stats={stats}
        reactionsSeen={profile.reactionsSeen}
        locked={locked}
        lockedText={weapon ? undefined : 'Equip a weapon to build your moves.'}
        absentText={(s) => carriedByText(registry, s)}
        footer={slotRow}
        onChange={(skill, chain) => {
          useDelveStore.getState().editDraft(skill, chain);
          setMessage(null);
        }}
        elements={elements.length > 0 ? elements : undefined}
        mana={<ManaPanel stats={stats} />}
      />
    </div>
  );
}
