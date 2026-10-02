import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { GearItem, GearSlot } from '@alloy/engine';
import { Tile, type TileProps } from './kit';
import { ItemIcon } from './ItemIcon';
import { getDelveRegistry } from './registry';
import { UPGRADE_EPSILON, manaStyle } from './format';

const EMPTY_BASE: Record<GearSlot, string> = {
  weapon: 'sword',
  helm: 'helm',
  chest: 'cuirass',
  gloves: 'gauntlets',
  boots: 'greaves',
  amulet: 'amulet',
  ring: 'ring',
};

/**
 * A tile's mark from its Power changes: ▲ better as it is (`asIs`, else `delta`), ◇ better only
 * with your moveset moved onto it (`delta`, a weapon's value as a home: Transfer), ▼ worse as it is.
 */
export function deltaMark(
  delta: number | null | undefined,
  asIs: number | null | undefined = delta,
): TileProps['delta'] {
  if (delta === null || delta === undefined) return null;
  const now = asIs ?? delta;
  if (now > UPGRADE_EPSILON) return 'up';
  if (delta > UPGRADE_EPSILON) return 'potential';
  return now < -UPGRADE_EPSILON ? 'down' : null;
}

export interface ItemTileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  item: GearItem | null;
  /** Needed to draw an empty slot silhouette. */
  slot?: GearSlot;
  size?: number;
  /** Power change if equipped (fraction); a weapon's as a home for your moveset. */
  delta?: number | null;
  /** A weapon's Power change as it is; ▲ reads it, and ◇ marks one better only as a home. */
  asIs?: number | null;
  selected?: boolean;
  dim?: boolean;
  isNew?: boolean;
  equipped?: boolean;
  testId?: string;
  label?: string;
}

/** An item as a kit `Tile`: its icon, rarity, ▲ ▼ ◇ mark, NEW, lock and equipped marks, and its mana pip. */
export const ItemTile = forwardRef<HTMLButtonElement, ItemTileProps>(function ItemTile(
  { item, slot, size = 56, delta, asIs, dim, isNew, label, style, ...rest },
  ref,
) {
  const mana = item ? manaStyle(getDelveRegistry(), item.mana) : null;
  return (
    <Tile
      {...rest}
      {...{ ref }}
      rarity={item?.rarity ?? null}
      size={size}
      delta={deltaMark(delta, asIs)}
      fresh={!!isNew && !item?.locked}
      locked={!!item?.locked}
      label={label ?? (item ? `${item.name}, ${item.rarity}` : `Empty ${slot ?? ''} slot`)}
      style={dim ? { ...style, opacity: 0.35 } : style}
      icon={
        item ? (
          <>
            <ItemIcon baseId={item.baseId} rarity={item.rarity} />
            {mana && (
              <span
                className="delve-tile-mana"
                data-mana={item.mana}
                title={`${mana.name} affinity`}
                style={{ background: mana.color }}
              />
            )}
          </>
        ) : slot ? (
          <ItemIcon baseId={EMPTY_BASE[slot]} rarity="common" ghost />
        ) : undefined
      }
    />
  );
});
