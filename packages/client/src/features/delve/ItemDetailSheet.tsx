import { useMemo, useRef, useState } from 'react';
import {
  CHAIN_SKILLS,
  attuneElement,
  baseDisplayName,
  carriedByText,
  carriedSkills,
  compareItem,
  findItem,
  inPair,
  isDiveActive,
  itemAffinityAttunement,
  itemStatLines,
  legendaryNeeds,
  movesetOf,
  movesetTransfer,
  pairElements,
  profileStats,
  reattuneCost,
  referenceDepth,
  reforgeCost,
  resolveChain,
  salvageDust,
  salvageValue,
  socketCap,
  unsocketMode,
  upgradeCost,
  weaponParts,
  type AbilitySlot,
  type Blow,
  type ChainSkill,
  type GearItem,
  type HeroStatKey,
  type ItemComparison,
  type ManaType,
} from '@alloy/engine';
import { partsText, pullText, runeNames, useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { BindPrompt } from './BindPrompt';
import { SKILL_NAME, blowText, chainText, moveText } from './chains/chain-text';
import { ItemSockets } from './runes/ItemSockets';
import {
  RARITY_COLOR,
  RARITY_LABEL,
  SLOT_LABEL,
  UPGRADE_EPSILON,
  formatDelta,
  formatNumber,
  formatStat,
  legendaryText,
  manaStyle,
} from './format';

interface ItemDetailSheetProps {
  uid: string;
  onClose: () => void;
  /** Open the chain builder (the Anvil): the equipped weapon's sheet links to it. */
  onBuild?: () => void;
}

/** A legendary power's skill, missing from the weapon (`legendaryNeeds`): "Needs a Defensive". */
const NEEDS_TEXT: Record<ChainSkill, string> = {
  basic: 'Needs a basic chain',
  primary: 'Needs a Primary',
  defensive: 'Needs a Defensive',
  ultimate: 'Needs an Ultimate',
};

/**
 * A weapon's moveset: each chain it carries with its slots ("Primary 2/5") and
 * moves, named as the chain builder names them ("medium Wildfire Burst").
 */
function MovesetView({ item }: { item: GearItem }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  // Only the moves' names are read: the hero's stats resolve them as well as any.
  const stats = useMemo(() => profileStats(registry, profile), [registry, profile]);
  const { chains, slots } = movesetOf(registry, item);
  const cap = registry.getDelveBalance().chains.cap;
  const carried = carriedSkills(registry, item.rarity);
  return (
    <div
      className="delve-panel mt-3 flex flex-col gap-1 px-3 py-2 text-xs"
      data-testid="item-moveset"
    >
      <div className="delve-display text-[11px] font-bold uppercase tracking-widest text-amber-300/80">
        Moveset
      </div>
      {CHAIN_SKILLS.map((s) => {
        const chain = chains[s];
        if (!carried.includes(s) || !chain)
          return (
            <div key={s} className="text-stone-500" data-testid={`moveset-${s}`}>
              {SKILL_NAME[s]}: {carriedByText(registry, s).toLowerCase()}
            </div>
          );
        const names = Array.isArray(chain)
          ? chain.map((b: Blow) => blowText(registry, b))
          : resolveChain(registry, stats, s as AbilitySlot, chain).moves.map(moveText);
        return (
          <div key={s} className="text-stone-300" data-testid={`moveset-${s}`}>
            <b className="text-stone-100">
              {SKILL_NAME[s]} {slots[s]}/{cap[s]}
            </b>{' '}
            · {chainText(names)}
          </div>
        );
      })}
      <ItemSockets chains={chains} cap={socketCap(registry, item.rarity)} />
    </div>
  );
}

/** Power, Damage and Toughness against what's worn. */
function DeltaRow({ cmp }: { cmp: ItemComparison }) {
  return (
    <div className="flex">
      <DeltaCell label="Power" value={cmp.powerPct} />
      <DeltaCell label="Damage" value={cmp.dpsPct} />
      <DeltaCell label="Toughness" value={cmp.ehpPct} />
    </div>
  );
}

function DeltaCell({ label, value }: { label: string; value: number }) {
  const color =
    value > UPGRADE_EPSILON ? '#4ade80' : value < -UPGRADE_EPSILON ? '#f87171' : '#a8a29e';
  const arrow = value > UPGRADE_EPSILON ? '▲' : value < -UPGRADE_EPSILON ? '▼' : '';
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-stone-400">{label}</span>
      <span className="delve-display text-base font-bold" style={{ color }}>
        {arrow} {formatDelta(value)}
      </span>
    </div>
  );
}

function qualityColor(roll: number): string {
  if (roll >= 0.9) return '#fbbf24';
  if (roll >= 0.6) return '#4ade80';
  if (roll >= 0.3) return '#60a5fa';
  return '#78716c';
}

/** Marks an attunement line of an element outside the pair: it grants nothing. */
function NotMine() {
  return (
    <span className="ml-1.5 text-[10px] text-stone-500" data-testid="not-your-element">
      not your element
    </span>
  );
}

export function ItemDetailSheet({ uid, onClose, onBuild }: ItemDetailSheetProps) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const unsocket = useDelveStore((s) => s.unsocket);
  const store = useDelveStore.getState;
  const [reforgeMode, setReforgeMode] = useState(false);
  const [reforgeIdx, setReforgeIdx] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const [confirmSalvage, setConfirmSalvage] = useState(false);
  const [binding, setBinding] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  const found = findItem(profile, uid);
  const item = found?.item;
  const isEquipped = found?.where === 'equipped';
  const depth = referenceDepth(profile);

  const worn = profile.equipped.weapon;
  // A bag weapon, while armed, is valued twice: as it is, and as a home for your moveset.
  const twoWays = !!item && !isEquipped && item.slot === 'weapon' && !!worn;
  const cmp = useMemo(
    () =>
      item && !isEquipped
        ? compareItem(profile.equipped, item, registry, depth, profile.pair)
        : null,
    [item, isEquipped, profile.equipped, profile.pair, registry, depth],
  );
  const asIs = useMemo(
    () =>
      item && twoWays
        ? compareItem(profile.equipped, item, registry, depth, profile.pair, 'asIs')
        : null,
    [item, twoWays, profile.equipped, profile.pair, registry, depth],
  );
  const transfer = item && twoWays ? movesetTransfer(registry, worn!, item) : null;
  // Your chains the target can't carry stay behind (their extra slots come back as Links).
  const leaves =
    item && transfer
      ? carriedSkills(registry, worn!.rarity).filter(
          (s) => !carriedSkills(registry, item.rarity).includes(s),
        )
      : [];

  if (!item) return null;
  const color = RARITY_COLOR[item.rarity];
  const lines = itemStatLines(item, registry);
  const implicits = lines.filter((l) => l.source === 'implicit');
  const affixes = lines.filter((l) => l.source === 'affix');
  const upCost = upgradeCost(registry, item);
  const rfCost = reforgeCost(registry, item);
  const raCost = reattuneCost(registry, item);
  const salvage = salvageValue(registry, item);
  // Equip takes a weapon as it is.
  const equipCmp = asIs ?? cmp;
  const isUpgrade = equipCmp !== null && equipCmp.powerPct > UPGRADE_EPSILON;
  const mana = manaStyle(registry, item.mana);
  const attuneDelta = cmp ? (Object.entries(cmp.attunementDelta) as [ManaType, number][]) : [];
  const base = registry.getDelveData().bases.find((b) => b.id === item.baseId);
  const attack = base?.attack;
  const diving = isDiveActive(profile);
  // What a transfer's leaving runes become: destroyed, or back to the pouch.
  const pull = unsocketMode(registry, unsocket);
  // What salvaging it does with its runes: asked first, whatever its rarity.
  const melts = pullText(registry, weaponParts(registry, item).runes, pull);
  const dust = salvageDust(registry, item, profile.pair);
  const ownMana = inPair(profile, item.mana);
  const notMine = (stat: HeroStatKey) => {
    const el = attuneElement(stat);
    return !!el && !inPair(profile, el);
  };
  const reattuneTo = pairElements(profile.pair).filter((m) => m !== item.mana);
  // Gear outside the pair while no second element is bound: equipping it asks to bind (between dives).
  const unbound =
    !!profile.pair.primary && !profile.pair.secondary && item.mana !== profile.pair.primary;
  // A legendary power tied to a skill the equipped weapon doesn't carry.
  const needs = item.legendary ? legendaryNeeds(item.legendary.id) : null;
  const dead = !!needs && !carriedSkills(registry, worn?.rarity ?? null).includes(needs);
  // Your moveset would make the weapon an upgrade (Transfer's mark, as Equip's is as it is).
  const homeUpgrade = !!transfer && cmp !== null && cmp.powerPct > UPGRADE_EPSILON;

  const flashStats = () => {
    statsRef.current?.animate?.(
      [
        { filter: 'brightness(2.2)', transform: 'scale(1.02)' },
        { filter: 'brightness(1)', transform: 'scale(1)' },
      ],
      { duration: 450, easing: 'ease-out' },
    );
  };

  const say = (text: string, good: boolean) => {
    setMessage({ text, good });
    window.setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 1800);
  };

  const onEquip = () => {
    if (unbound && !store().bindDeclined.includes(item.mana)) {
      setBinding(true);
      return;
    }
    store().equip(item.uid);
    playSound('orbPlace');
    vibrate('medium');
    onClose();
  };

  const onUnequip = () => {
    try {
      store().unequip(item.slot);
      playSound('orbRemove');
      onClose();
    } catch {
      say('Bag is full', false);
    }
  };

  const onTransfer = () => {
    const res = store().transfer(item.uid);
    if (res.ok) {
      playSound('combineMerge');
      vibrate('success');
      const links = res.links ? ` · +${res.links} Link${res.links > 1 ? 's' : ''}` : '';
      const parts = partsText(registry, res.runes, res.destroyed);
      showToast(`Your moveset moved onto ${item.name}${links}${parts ? ` · ${parts}` : ''}`);
      onClose();
    } else {
      playSound('combineFail');
      say(res.reason ?? 'Cannot transfer', false);
    }
  };

  const onUpgrade = () => {
    const res = store().upgrade(item.uid);
    if (res.ok) {
      playSound('upgradeTier');
      vibrate('success');
      flashStats();
      say(`Upgraded to +${res.item!.upgrade}`, true);
    } else {
      playSound('combineFail');
      say(res.reason ?? 'Cannot upgrade', false);
    }
  };

  const onReforge = () => {
    if (reforgeIdx === null) return;
    const res = store().reforge(item.uid, reforgeIdx);
    if (res.ok) {
      playSound('combineMerge');
      vibrate('medium');
      setFlashIdx(reforgeIdx);
      window.setTimeout(() => setFlashIdx(null), 700);
      say('Reforged!', true);
    } else {
      playSound('combineFail');
      say(res.reason ?? 'Cannot reforge', false);
    }
  };

  const onReattune = (to: ManaType) => {
    const res = store().reattune(item.uid, to);
    if (res.ok) {
      playSound('combineMerge');
      vibrate('medium');
      flashStats();
      say(`Attuned to ${manaStyle(registry, to).name}`, true);
    } else {
      playSound('combineFail');
      say(res.reason ?? 'Cannot re-attune', false);
    }
  };

  const onSalvage = () => {
    const precious =
      !!melts || item.rarity === 'rare' || item.rarity === 'epic' || item.rarity === 'legendary';
    if (precious && !confirmSalvage) {
      setConfirmSalvage(true);
      return;
    }
    const { scrap, links, runes, destroyed } = store().salvage([item.uid]);
    playSound('orbRemove');
    vibrate('light');
    if (links > 0) showToast(`+${links} Link${links > 1 ? 's' : ''} from its extra slots`);
    const parts = partsText(registry, runes, destroyed);
    if (parts) showToast(parts);
    if (scrap > 0) onClose();
  };

  const onLock = () => {
    store().toggleLock(item.uid);
    playSound('buttonClick');
  };

  return (
    <div className="delve-sheet-backdrop" onClick={onClose} data-testid="item-sheet" data-pad-scope>
      <div
        className="delve-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={item.name}
        // The bind prompt holds the keyboard: nothing behind it takes focus or clicks.
        inert={binding}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <ItemTile item={item} size={72} />
          <div className="min-w-0 flex-1">
            <div
              className="delve-display truncate text-xl font-bold"
              style={{ color }}
              data-testid="item-name"
            >
              {item.name}
            </div>
            <div className="text-xs text-stone-300">
              {RARITY_LABEL[item.rarity]} {baseDisplayName(registry, item)} ·{' '}
              {SLOT_LABEL[item.slot]}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-stone-400">
              <span
                className="rounded px-1.5 py-0.5 font-semibold"
                style={
                  ownMana
                    ? { background: `${mana.color}22`, color: mana.color }
                    : { background: 'rgba(255,255,255,0.05)', color: '#78716c' }
                }
                data-testid="item-mana"
              >
                {mana.icon} {mana.name} +{itemAffinityAttunement(registry, item)}
                {!ownMana && ' · not your element'}
              </span>
              {attack && (
                <span className="rounded bg-white/5 px-1.5 py-0.5">
                  {attack.kind === 'bolt' ? '🎯 Ranged' : '⚔️ Melee'}
                </span>
              )}
              {base?.tempo !== undefined && (
                <span className="rounded bg-white/5 px-1.5 py-0.5" data-testid="item-tempo">
                  Tempo {base.tempo}×:{' '}
                  {base.tempo > 1 ? 'slower' : base.tempo < 1 ? 'quicker' : 'standard'} holds and
                  chain beats
                </span>
              )}
              <span className="rounded bg-white/5 px-1.5 py-0.5">iLvl {item.ilvl}</span>
              {item.upgrade > 0 && (
                <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-amber-200">
                  +{item.upgrade} forged
                </span>
              )}
              {isEquipped && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                  Equipped
                </span>
              )}
            </div>
          </div>
          <button
            className="delve-btn px-3 py-1 text-sm"
            onClick={onClose}
            aria-label="Close"
            data-pad-back
          >
            ✕
          </button>
        </div>

        {/* Comparison */}
        {cmp && (
          <div className="delve-panel mt-3 px-3 py-2" data-testid="item-compare">
            <div className="mb-1 text-center text-[11px] text-stone-400">
              {cmp.replaced ? (
                <>
                  vs{' '}
                  <span style={{ color: RARITY_COLOR[cmp.replaced.rarity] }}>
                    {cmp.replaced.name}
                  </span>
                </>
              ) : (
                'Empty slot — pure gain'
              )}
            </div>
            {asIs && transfer ? (
              <>
                <div className="text-center text-[10px] uppercase tracking-wider text-stone-500">
                  As it is
                </div>
                <div data-testid="compare-as-is">
                  <DeltaRow cmp={asIs} />
                </div>
                <div className="mt-1 text-center text-[10px] uppercase tracking-wider text-stone-500">
                  With your moveset · ⚙ {formatNumber(transfer.scrap)} to move it
                  {transfer.sockets > 0 &&
                    `, its ${transfer.sockets} socket${transfer.sockets === 1 ? '' : 's'} included`}
                </div>
                <div data-testid="compare-home">
                  <DeltaRow cmp={cmp} />
                </div>
              </>
            ) : (
              <DeltaRow cmp={cmp} />
            )}
            {attuneDelta.length > 0 && (
              <div
                className="mt-1.5 flex flex-wrap justify-center gap-x-3 text-xs"
                data-testid="attune-delta"
              >
                {attuneDelta.map(([m, d]) => {
                  const st = manaStyle(registry, m);
                  return (
                    <span key={m} style={{ color: d > 0 ? st.color : '#f87171' }}>
                      {st.icon} {d > 0 ? '+' : '−'}
                      {Math.abs(d)} {st.name}
                    </span>
                  );
                })}
              </div>
            )}
            {attuneDelta.length > 0 && (
              <div
                className="mt-1 text-center text-[11px] text-stone-400"
                data-testid="attune-note"
              >
                Attunement grows your mana pool and powers abilities of its element.
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div ref={statsRef} className="mt-3 space-y-1.5">
          {implicits.map((l, i) => (
            <div
              key={`i${i}`}
              className="text-sm"
              style={{ color: notMine(l.stat) ? '#57534e' : '#d6d3d1' }}
            >
              {formatStat(registry, l.stat, l.value)}
              {notMine(l.stat) && <NotMine />}
            </div>
          ))}
          {implicits.length > 0 && affixes.length > 0 && <div className="my-1 h-px bg-white/10" />}
          {affixes.map((l, i) => {
            const selectable = reforgeMode;
            const selected = reforgeIdx === i;
            return (
              <button
                key={`a${i}-${l.stat}`}
                type="button"
                disabled={!selectable}
                onClick={() => setReforgeIdx(i)}
                className="block w-full rounded-md px-1.5 py-1 text-left"
                style={{
                  background: selected
                    ? 'rgba(96,165,250,0.15)'
                    : flashIdx === i
                      ? 'rgba(250,204,21,0.25)'
                      : 'transparent',
                  outline: selectable
                    ? `1px dashed ${selected ? '#60a5fa' : 'rgba(255,255,255,0.15)'}`
                    : 'none',
                  cursor: selectable ? 'pointer' : 'default',
                  transition: 'background 0.3s',
                }}
                data-testid="item-affix"
              >
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: notMine(l.stat) ? '#57534e' : '#93c5fd' }}>
                    {formatStat(registry, l.stat, l.value)}
                    {notMine(l.stat) && <NotMine />}
                  </span>
                  {l.roll >= 0.9 && (
                    <span className="text-[10px] font-bold text-amber-300">PERFECT</span>
                  )}
                </div>
                <div className="delve-quality mt-1">
                  <span
                    style={{
                      width: `${Math.round(l.roll * 100)}%`,
                      background: qualityColor(l.roll),
                    }}
                  />
                </div>
              </button>
            );
          })}
          {item.legendary && (
            <div
              className="mt-2 rounded-lg px-3 py-2 text-sm"
              style={{
                background: 'rgba(251,146,60,0.1)',
                border: '1px solid rgba(251,146,60,0.45)',
                color: '#fed7aa',
              }}
            >
              <div className="delve-display text-xs font-bold uppercase tracking-widest text-orange-400">
                ★ {registry.getLegendary(item.legendary.id).name}
              </div>
              {legendaryText(registry, item.legendary.id, item.legendary.value)}
              {dead && needs && (
                <div
                  className="mt-1 text-xs font-semibold text-amber-200"
                  data-testid="legendary-dead"
                >
                  {NEEDS_TEXT[needs]}: your weapon doesn't carry one.
                </div>
              )}
            </div>
          )}
        </div>

        {item.slot === 'weapon' && <MovesetView item={item} />}
        {isEquipped && item.slot === 'weapon' && onBuild && (
          <button
            type="button"
            className="delve-chip mt-2"
            onClick={onBuild}
            data-testid="open-builder"
          >
            Build its moves in the chain builder ›
          </button>
        )}

        {message && (
          <div
            className="mt-3 text-center text-sm font-semibold"
            style={{ color: message.good ? '#4ade80' : '#f87171' }}
            role="status"
          >
            {message.text}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {diving ? (
            <div
              className="delve-panel flex items-center justify-center p-2 text-center text-xs text-amber-200"
              data-testid="equip-locked"
            >
              Equip at the Anvil, between dives
            </div>
          ) : isEquipped ? (
            <button className="delve-btn" onClick={onUnequip}>
              Unequip
            </button>
          ) : (
            <button
              className={`delve-btn ${isUpgrade ? 'delve-btn-green' : ''}`}
              onClick={onEquip}
              data-testid="equip-button"
            >
              {isUpgrade ? '▲ Equip' : 'Equip'}
            </button>
          )}
          {diving ? (
            <div
              className="delve-panel flex items-center justify-center p-2 text-center text-xs text-amber-200"
              data-testid="forge-locked"
            >
              Forge and salvage at the Anvil
            </div>
          ) : (
            <>
              <button
                className="delve-btn delve-btn-gold"
                onClick={onUpgrade}
                disabled={upCost === null}
                data-testid="upgrade-button"
              >
                {upCost === null ? 'Max +10' : `Upgrade ⚙ ${formatNumber(upCost)}`}
              </button>
              {affixes.length > 0 &&
                (reforgeMode ? (
                  <button className="delve-btn" onClick={onReforge} disabled={reforgeIdx === null}>
                    {reforgeIdx === null ? 'Pick an affix' : `Reforge ⚙ ${formatNumber(rfCost)}`}
                  </button>
                ) : (
                  <button className="delve-btn" onClick={() => setReforgeMode(true)}>
                    Reforge…
                  </button>
                ))}
              <button
                className="delve-btn delve-btn-danger"
                onClick={onSalvage}
                disabled={isEquipped || item.locked}
                data-testid="salvage-button"
              >
                {confirmSalvage
                  ? `Tap again to melt${melts ? ` · ${melts}` : ''}`
                  : `Salvage +${formatNumber(salvage)}${dust > 0 ? ` · ✦ ${dust}` : ''}`}
              </button>
            </>
          )}
          <button className="delve-btn" onClick={onLock}>
            {item.locked ? 'Unlock' : 'Lock'}
          </button>
          {transfer && !diving && (
            <button
              className={`delve-btn col-span-2 ${homeUpgrade ? 'delve-btn-green' : ''}`}
              onClick={onTransfer}
              data-testid="transfer-button"
            >
              {homeUpgrade ? '▲ ' : ''}Transfer my moveset here · ⚙ {formatNumber(transfer.scrap)}
              {transfer.links > 0 && ` · +${transfer.links} Link${transfer.links === 1 ? '' : 's'}`}
            </button>
          )}
          {transfer && !diving && leaves.length > 0 && (
            <div
              className="col-span-2 text-center text-[11px] text-amber-200/90"
              data-testid="transfer-leaves"
            >
              Leaves your {leaves.map((s) => SKILL_NAME[s]).join(' and ')} behind
            </div>
          )}
          {transfer && !diving && transfer.runes.length > 0 && (
            <div
              className="col-span-2 text-center text-[11px] text-amber-200/90"
              data-testid="transfer-runes"
            >
              {pull === 'destroy'
                ? `Destroys ${runeNames(registry, transfer.runes)}: no socket for ${transfer.runes.length === 1 ? 'it' : 'them'} there`
                : `${runeNames(registry, transfer.runes)} back to your pouch`}
            </div>
          )}
        </div>
        {reattuneTo.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5" data-testid="reattune">
            <div className="text-[11px] text-stone-400">
              Re-attune to your other element: its {mana.name} lines follow.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {reattuneTo.map((m) => {
                const st = manaStyle(registry, m);
                return (
                  <button
                    key={m}
                    type="button"
                    className="delve-chip"
                    disabled={diving}
                    style={diving ? { opacity: 0.35 } : undefined}
                    onClick={() => onReattune(m)}
                    data-testid={`reattune-${m}`}
                  >
                    {st.icon} {st.name} · ✦ {raCost}
                  </button>
                );
              })}
            </div>
            {diving && (
              <div className="text-[11px] text-amber-200" data-testid="reattune-locked">
                Re-attune between dives.
              </div>
            )}
          </div>
        )}
        <div className="mt-3 text-center text-[11px] text-stone-500">
          ⚙ {formatNumber(profile.scrap)} scrap · ✦ {formatNumber(profile.manaDust)} Mana Dust · 🔗{' '}
          {profile.links} Link{profile.links === 1 ? '' : 's'}
        </div>
      </div>
      {binding && !isEquipped && (
        <BindPrompt
          item={item}
          onDone={() => {
            setBinding(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}
