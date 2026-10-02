import type { ReactElement } from 'react';
import { baseDisplayName } from '@alloy/engine';
import { Tooltip, TooltipCard, type TooltipProps } from '../kit';
import { getDelveRegistry } from '../registry';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT, SLOT_LABEL } from '../format';
import { useItemComparison } from './useItemComparison';
import { PowerDelta } from './PowerDelta';
import { ItemStatLines } from './ItemStatLines';
import { LegendaryBox } from './LegendaryBox';

/**
 * An item's card: its name in its rarity, what it is and where, how a bag item
 * compares with what's worn, its stat lines and its legendary power.
 */
export function ItemTooltipCard({ uid }: { uid: string }): ReactElement | null {
  const { item, where, cmp } = useItemComparison(uid);
  if (!item) return null;
  const what = `${RARITY_LABEL[item.rarity]} ${baseDisplayName(getDelveRegistry(), item)}`;
  return (
    <TooltipCard
      title={<span style={{ color: RARITY_TEXT[item.rarity] }}>{item.name}</span>}
      subtitle={`${what} · ${SLOT_LABEL[item.slot]}${where === 'equipped' ? ' · Equipped' : ''}`}
      accent={RARITY_COLOR[item.rarity]}
      width={380}
    >
      {where === 'bag' && <PowerDelta cmp={cmp} label="Against what you wear" />}
      <ItemStatLines item={item} />
      <LegendaryBox item={item} />
    </TooltipCard>
  );
}

/**
 * Hover or focus shows the item's card: the hub's equipped tiles (Phase 2) and
 * the HUD's Found log (Phase 3, with `portal={false}`).
 */
export function ItemTooltip({
  uid,
  ...rest
}: { uid: string } & Omit<TooltipProps, 'content'>): ReactElement {
  return <Tooltip {...rest} content={() => <ItemTooltipCard uid={uid} />} />;
}
