import type { ReactElement } from 'react';
import { BOON_TIER_NAMES, type BoonFamily, type BoonTierIndex } from '@alloy/engine';
import { RARITY_TEXT } from '../format';
import { TIER_NUMERAL } from '../runes/rune-style';
import { BOON_STYLE } from './boon-style';

export interface BoonCardProps {
  /** The boon's id (the card's `data-boon`). */
  id: string;
  family: BoonFamily;
  tier: BoonTierIndex;
  name: string;
  /** The tier's whole card line, from the data. */
  text: string;
  /** How many of this boon the dive wears (its entries in `diveBuffs`). */
  count: number;
  cap: number;
  /** The step's first focus. */
  first?: boolean;
  onTake: () => void;
}

/**
 * One boon on offer (the boons spec, 6): a plate with its family's colour on its edge, the
 * family's name and the tier mark (I / II / III in the common, rare and epic colours), the name,
 * the tier's line and, once one is worn, "Taken n of cap". Presentational: the kit gallery shows it too.
 */
export function BoonCard({
  id,
  family,
  tier,
  name,
  text,
  count,
  cap,
  first,
  onTake,
}: BoonCardProps): ReactElement {
  const { color, label } = BOON_STYLE[family];
  return (
    <button
      type="button"
      className="k-plate relative flex flex-col gap-[14px] p-6 pl-8 text-left text-[var(--k-text)]"
      onClick={onTake}
      data-pad-first={first || undefined}
      data-primary-action={first ? 'boon' : undefined}
      data-boon={id}
      data-family={family}
      data-tier={tier}
      data-testid="boon-card"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[6px]"
        style={{ background: color }}
        data-boon-edge
      />
      <span className="flex items-baseline justify-between gap-3">
        <span className="k-label text-[var(--k-text-3)]">{label}</span>
        <span
          className="k-label"
          style={{ color: RARITY_TEXT[BOON_TIER_NAMES[tier - 1]] }}
          data-boon-tier
        >
          {TIER_NUMERAL[tier]}
        </span>
      </span>
      <span className="k-disp text-[30px]">{name}</span>
      <span className="text-[18px] leading-normal text-[var(--k-text-2)]">{text}</span>
      {count > 0 && (
        <span className="k-caption mt-auto text-[var(--k-text-3)]" data-testid="boon-taken">
          Taken {count} of {cap}
        </span>
      )}
    </button>
  );
}
