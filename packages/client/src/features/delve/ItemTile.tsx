import { forwardRef } from 'react';
import type { GearItem, GearSlot } from '@alloy/engine';
import { ItemIcon } from './ItemIcon';
import { getDelveRegistry } from './registry';
import { RARITY_COLOR, UPGRADE_EPSILON, manaStyle } from './format';

const EMPTY_BASE: Record<GearSlot, string> = {
  weapon: 'sword',
  helm: 'helm',
  chest: 'cuirass',
  gloves: 'gauntlets',
  boots: 'greaves',
  amulet: 'amulet',
  ring: 'ring',
};

export interface ItemTileProps {
  item: GearItem | null;
  /** Needed to draw an empty slot silhouette. */
  slot?: GearSlot;
  size?: number | string;
  /** Power change if equipped (fraction). Shows ▲/▼. */
  delta?: number | null;
  selected?: boolean;
  dim?: boolean;
  isNew?: boolean;
  equipped?: boolean;
  onClick?: () => void;
  testId?: string;
  label?: string;
}

export const ItemTile = forwardRef<HTMLButtonElement, ItemTileProps>(function ItemTile(
  { item, slot, size = 56, delta, selected, dim, isNew, equipped, onClick, testId, label },
  ref,
) {
  const rarity = item?.rarity ?? 'common';
  const color = RARITY_COLOR[rarity];
  const high = item && (rarity === 'epic' || rarity === 'legendary');
  const up = delta !== undefined && delta !== null && delta > UPGRADE_EPSILON;
  const down = delta !== undefined && delta !== null && delta < -UPGRADE_EPSILON;
  const mana = item ? manaStyle(getDelveRegistry(), item.mana) : null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-rarity={item ? rarity : undefined}
      aria-label={label ?? (item ? `${item.name}, ${rarity}` : `Empty ${slot ?? ''} slot`)}
      className={`delve-tile ${item?.rarity === 'legendary' ? 'delve-tile-legendary' : ''}`}
      style={{
        width: size,
        height: size,
        opacity: dim ? 0.35 : 1,
        borderColor: item
          ? rarity === 'common'
            ? 'rgba(185,185,196,0.35)'
            : color
          : 'rgba(255,255,255,0.08)',
        background: item
          ? `radial-gradient(circle at 50% 38%, ${color}40 0%, ${color}10 45%, transparent 72%), #15151e`
          : 'rgba(255,255,255,0.025)',
        boxShadow: selected
          ? `0 0 0 2px #fff, 0 0 14px ${color}`
          : high
            ? `0 0 12px ${color}66, inset 0 0 10px ${color}33`
            : 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <span className="delve-tile-icon">
        {item ? (
          <ItemIcon baseId={item.baseId} rarity={item.rarity} />
        ) : slot ? (
          <ItemIcon baseId={EMPTY_BASE[slot]} rarity="common" ghost />
        ) : null}
      </span>
      {item && item.upgrade > 0 && <span className="delve-tile-upgrade">+{item.upgrade}</span>}
      {item?.locked && (
        <span className="delve-tile-lock" aria-label="locked">
          <svg viewBox="0 0 16 16" width="10" height="10">
            <path d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 1 0-4 0z" fill="currentColor" />
          </svg>
        </span>
      )}
      {isNew && !item?.locked && <span className="delve-tile-new" />}
      {equipped && <span className="delve-tile-equipped">E</span>}
      {mana && (
        <span
          className="delve-tile-mana"
          data-mana={item?.mana}
          title={`${mana.name} affinity`}
          style={{ background: mana.color, boxShadow: `0 0 6px ${mana.color}` }}
        />
      )}
      {(up || down) && (
        <span
          className={`delve-tile-delta ${up ? 'up' : 'down'}`}
          data-testid={up ? 'upgrade-badge' : undefined}
        >
          {up ? '▲' : '▼'}
        </span>
      )}
    </button>
  );
});
