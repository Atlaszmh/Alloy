import { useId, useMemo, useState } from 'react';
import {
  CHAIN_SKILLS,
  MANA_TYPES,
  addSlot,
  baseSlots,
  carriedByText,
  heroChains,
  isDiveActive,
  manaPool,
  movesetOf,
  pairElements,
  profileStats,
  movesOf,
  setChains,
  slotPrice,
  socketCap,
  socketPrice,
  socketsOf,
  unsocketMode,
  withMove,
  type ChainSkill,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { applyLabel, selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';
import { ManaPanel } from './ManaPanel';
import { ChainEditor, type ChainRunes } from './chains/ChainEditor';
import { listed } from './chains/chain-text';

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
 * chain's slots, with Add slot's price; each move's sockets and runes, which
 * the draft carries too; and your Mana view. Read-only while a dive is under
 * way, and unarmed (the unarmed default shows).
 */
export function AbilitiesPanel() {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const unsocket = useDelveStore((s) => s.unsocket);
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const [message, setMessage] = useState<string | null>(null);
  const id = useId();
  const saved = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  // The draft against the weapon: the skills it changes, Apply's options and total, the
  // engine's dry run and the pouch it leaves; and the chains shown.
  const view = useDelveStore(selectDraftApply);
  const changed = view.changes;
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
  const { price, refused, dry: applying } = view;
  const applyWhy = applying && !applying.ok ? applying.reason : null;
  // Unpriced, the price line says why; Apply's own reason shows only when it says something else.
  const applyNote = applyWhy && applyWhy !== refused ? applyWhy : null;
  // What Apply spends, each against what the hero holds (Links netted: the sockets of moves
  // removed pay for those opened).
  const links = price ? price.links - price.refundLinks : 0;
  const costs = [
    price && price.dust > 0
      ? `✦ ${price.dust} Mana Dust (you have ✦ ${formatNumber(profile.manaDust)})`
      : null,
    links > 0 ? `🔗 ${links} Link${links === 1 ? '' : 's'} (you have 🔗 ${profile.links})` : null,
    price && price.scrap > 0
      ? `⚙ ${formatNumber(price.scrap)} scrap (you have ⚙ ${formatNumber(profile.scrap)})`
      : null,
  ].filter((c) => c !== null);
  const mode = unsocketMode(registry, unsocket);
  const pullScrap = registry.getDelveBalance().runes.pullScrap;
  // The weapon's sockets in the builder: the pouch the draft leaves, the rarity's cap, the price
  // by index, the pull rule's text, and the engine's own op run dry with one more socket on a
  // move: why "+ socket" is off (a draft Apply already refuses says so itself).
  const runes: ChainRunes | undefined = weapon && {
    pouch: view.pouch,
    socketCap: socketCap(registry, weapon.rarity),
    socketPrice: (open) => socketPrice(registry, open),
    weaponBaseId: weapon.baseId,
    pullText: (r) =>
      mode === 'destroy'
        ? 'Pull · destroys it'
        : `Pull · ⚙ ${pullScrap[r.tier - 1]}, back to your pouch`,
    openWhy: (skill, index) => {
      const chain = chains[skill];
      if (!chain || (applying && !applying.ok)) return null;
      const m = movesOf(chain)[index];
      const next = withMove(chain, index, { ...m, runes: [...socketsOf(m), null] });
      const res = setChains(registry, profile, { ...changed, [skill]: next }, view.opts);
      return res.ok ? null : (res.reason ?? null);
    },
  };
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
    // Why Add slot is off, in the engine's words (a dry run of its op); none
    // while a dive locks the whole builder. It adds to the saved chain.
    const dry = next && !changed[skill] ? addSlot(registry, profile, skill) : null;
    const why = !next
      ? null
      : changed[skill]
        ? 'Apply or revert this chain first'
        : dry && !dry.ok
          ? dry.reason
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
            aria-describedby={why && !locked ? `${id}-slot` : undefined}
            data-testid="add-slot"
          >
            + Add slot · 🔗 {next.links} · ⚙ {formatNumber(next.scrap)}
          </button>
        )}
        {why && !locked && (
          <span id={`${id}-slot`} className="text-amber-200/80" data-testid="add-slot-why">
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
          <span
            id={`${id}-price`}
            className="flex-1 text-xs text-stone-300"
            data-testid="chain-price"
          >
            {refused
              ? refused
              : costs.length > 0
                ? `Changes cost ${listed(costs)}`
                : profile.stats.dives === 0
                  ? 'Changes are free until your first dive'
                  : 'Changes are free'}
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
            disabled={!applying?.ok}
            onClick={onApply}
            aria-describedby={applyNote ? `${id}-apply` : applyWhy ? `${id}-price` : undefined}
            data-testid="chain-apply"
          >
            {applyLabel(registry, price)}
          </button>
          {applyNote && (
            <span
              id={`${id}-apply`}
              className="w-full text-right text-xs text-amber-200/80"
              data-testid="chain-apply-why"
            >
              {applyNote}
            </span>
          )}
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
        onChange={(skill, chain, map) => {
          useDelveStore.getState().editDraft(skill, chain, map);
          setMessage(null);
        }}
        elements={elements.length > 0 ? elements : undefined}
        mana={<ManaPanel stats={stats} />}
        runes={runes}
      />
    </div>
  );
}
