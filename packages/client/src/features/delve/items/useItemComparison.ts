import { useMemo } from 'react';
import {
  compareItem,
  findItem,
  referenceDepth,
  type GearItem,
  type ItemComparison,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';

/**
 * An item of the save by uid, where it is, what's worn in its slot (null when
 * the slot is empty or holds the item itself), and how equipping it would
 * change the hero. A bag weapon, while armed, is valued twice: `cmp` as a home
 * for your moveset (`compareItem`'s default) and `asIs` as it is, which is
 * what Equip does; every other item has `asIs` null. An equipped item has no
 * comparison.
 */
export function useItemComparison(uid: string | null): {
  item: GearItem | null;
  worn: GearItem | null;
  where: 'bag' | 'equipped' | null;
  cmp: ItemComparison | null;
  asIs: ItemComparison | null;
} {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const found = uid ? findItem(profile, uid) : null;
  const item = found?.item ?? null;
  const where = found?.where ?? null;
  const inSlot = item ? (profile.equipped[item.slot] ?? null) : null;
  const worn = inSlot && inSlot.uid !== item?.uid ? inSlot : null;
  const depth = referenceDepth(profile);
  const inBag = where === 'bag';
  const twoWays = inBag && item?.slot === 'weapon' && !!worn;
  const cmp = useMemo(
    () =>
      item && inBag ? compareItem(profile.equipped, item, registry, depth, profile.pair) : null,
    [item, inBag, profile.equipped, profile.pair, registry, depth],
  );
  const asIs = useMemo(
    () =>
      item && twoWays
        ? compareItem(profile.equipped, item, registry, depth, profile.pair, 'asIs')
        : null,
    [item, twoWays, profile.equipped, profile.pair, registry, depth],
  );
  return { item, worn, where, cmp, asIs };
}
