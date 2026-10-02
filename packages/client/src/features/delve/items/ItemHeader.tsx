import type { ReactElement } from 'react';
import {
  baseDisplayName,
  findItem,
  inPair,
  itemAffinityAttunement,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { ItemTile } from '../ItemTile';
import { RARITY_LABEL, RARITY_TEXT, SLOT_LABEL, manaStyle } from '../format';

const SIZES = {
  md: { tile: 56, name: 'text-lg' },
  lg: { tile: 72, name: 'text-xl' },
} as const;

/**
 * An item's tile, name, rarity, base and slot, then its tags: its mana and the
 * attunement it gives (marked when outside the pair), melee or ranged, a
 * weapon's tempo, item level, forge level, and Equipped.
 */
export function ItemHeader({
  item,
  size = 'md',
}: {
  item: GearItem;
  size?: 'md' | 'lg';
}): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const mana = manaStyle(registry, item.mana);
  const ownMana = inPair(profile, item.mana);
  const isEquipped = findItem(profile, item.uid)?.where === 'equipped';
  const base = registry.getDelveData().bases.find((b) => b.id === item.baseId);
  const attack = base?.attack;
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <ItemTile item={item} size={SIZES[size].tile} />
      <div className="min-w-0 flex-1">
        <div
          className={`delve-display truncate ${SIZES[size].name} font-bold`}
          style={{ color: RARITY_TEXT[item.rarity] }}
          data-testid="item-name"
        >
          {item.name}
        </div>
        <div className="text-xs text-stone-300">
          {RARITY_LABEL[item.rarity]} {baseDisplayName(registry, item)} · {SLOT_LABEL[item.slot]}
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
              {base.tempo > 1 ? 'slower' : base.tempo < 1 ? 'quicker' : 'standard'} holds and chain
              beats
            </span>
          )}
          <span className="rounded bg-white/5 px-1.5 py-0.5">iLvl {item.ilvl}</span>
          {item.upgrade > 0 && (
            <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-amber-200">
              +{item.upgrade} forged
            </span>
          )}
          {isEquipped && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">Equipped</span>
          )}
        </div>
      </div>
    </div>
  );
}
