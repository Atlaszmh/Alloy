import { useMemo, useRef, useState } from 'react';
import {
  baseDisplayName,
  compareItem,
  findItem,
  itemStatLines,
  referenceDepth,
  reforgeCost,
  salvageValue,
  upgradeCost,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import {
  RARITY_COLOR,
  RARITY_LABEL,
  SLOT_LABEL,
  UPGRADE_EPSILON,
  formatDelta,
  formatNumber,
  formatStat,
  legendaryText,
} from './format';

interface ItemDetailSheetProps {
  uid: string;
  onClose: () => void;
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

export function ItemDetailSheet({ uid, onClose }: ItemDetailSheetProps) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const store = useDelveStore.getState;
  const [reforgeMode, setReforgeMode] = useState(false);
  const [reforgeIdx, setReforgeIdx] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const [confirmSalvage, setConfirmSalvage] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  const found = findItem(profile, uid);
  const item = found?.item;
  const isEquipped = found?.where === 'equipped';
  const depth = referenceDepth(profile);

  const cmp = useMemo(
    () => (item && !isEquipped ? compareItem(profile.equipped, item, registry, depth) : null),
    [item, isEquipped, profile.equipped, registry, depth],
  );

  if (!item) return null;
  const color = RARITY_COLOR[item.rarity];
  const lines = itemStatLines(item, registry);
  const implicits = lines.filter((l) => l.source === 'implicit');
  const affixes = lines.filter((l) => l.source === 'affix');
  const upCost = upgradeCost(registry, item);
  const rfCost = reforgeCost(registry, item);
  const salvage = salvageValue(registry, item);
  const isUpgrade = cmp !== null && cmp.powerPct > UPGRADE_EPSILON;

  const flashStats = () => {
    statsRef.current?.animate(
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

  const onSalvage = () => {
    const precious =
      item.rarity === 'rare' || item.rarity === 'epic' || item.rarity === 'legendary';
    if (precious && !confirmSalvage) {
      setConfirmSalvage(true);
      return;
    }
    const scrap = store().salvage([item.uid]);
    playSound('orbRemove');
    vibrate('light');
    if (scrap > 0) onClose();
  };

  const onLock = () => {
    store().toggleLock(item.uid);
    playSound('buttonClick');
  };

  return (
    <div className="delve-sheet-backdrop" onClick={onClose} data-testid="item-sheet">
      <div
        className="delve-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={item.name}
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
          <button className="delve-btn px-3 py-1 text-sm" onClick={onClose} aria-label="Close">
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
            <div className="flex">
              <DeltaCell label="Power" value={cmp.powerPct} />
              <DeltaCell label="Damage" value={cmp.dpsPct} />
              <DeltaCell label="Toughness" value={cmp.ehpPct} />
            </div>
          </div>
        )}

        {/* Stats */}
        <div ref={statsRef} className="mt-3 space-y-1.5">
          {implicits.map((l, i) => (
            <div key={`i${i}`} className="text-sm text-stone-300">
              {formatStat(registry, l.stat, l.value)}
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
                  <span style={{ color: '#93c5fd' }}>{formatStat(registry, l.stat, l.value)}</span>
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
            </div>
          )}
        </div>

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
          {isEquipped ? (
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
            {confirmSalvage ? 'Tap again to melt' : `Salvage +${formatNumber(salvage)}`}
          </button>
          <button className="delve-btn" onClick={onLock}>
            {item.locked ? 'Unlock' : 'Lock'}
          </button>
        </div>
        <div className="mt-3 text-center text-[11px] text-stone-500">
          ⚙ {formatNumber(profile.scrap)} scrap
        </div>
      </div>
    </div>
  );
}
