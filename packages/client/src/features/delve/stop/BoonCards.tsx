import { useState, type ReactElement } from 'react';
import {
  BOON_TIER_NAMES,
  boonCount,
  type BoonFamily,
  type BoonStop,
  type BoonTierIndex,
  type Buff,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useUIStore } from '@/stores/uiStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from '../registry';
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

/**
 * A boons stop's step 1 (the boons spec, 6): its offers as cards, each taken by a click, A or
 * Enter through the store's `takeStop` (free; the stop is then taken and `StopScreen` moves to
 * the road). A refusal shows the engine's reason under the cards.
 */
export function BoonCards({ stop, worn }: { stop: BoonStop; worn: readonly Buff[] }): ReactElement {
  const registry = getDelveRegistry();
  const [message, setMessage] = useState<string | null>(null);
  const take = (index: number) => {
    const res = useDelveStore.getState().takeStop({ kind: 'boon', index });
    if (res.ok) {
      playSound('upgradeTier');
      vibrate('success');
      showToast(`${registry.getBoon(stop.offers[index].id)!.name}: taken`);
      useUIStore.getState().markSeen('stop');
    } else {
      playSound('combineFail');
      setMessage(res.reason ?? 'Cannot take it');
    }
  };
  return (
    <section
      aria-label="Boons"
      className="flex min-h-0 flex-1 flex-col gap-4"
      data-testid="stop-boon"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="k-section m-0 text-[26px] text-[var(--k-hot-hi)]">Take one boon</h2>
        <span className="text-[16px] text-[var(--k-text-3)]">it lasts the dive, or skip it</span>
      </div>
      <div className="grid min-h-0 grid-cols-3 items-stretch gap-[18px]">
        {stop.offers.map((offer, i) => {
          const def = registry.getBoon(offer.id);
          if (!def) return null; // a row the data no longer holds
          return (
            <BoonCard
              key={offer.id}
              id={offer.id}
              family={def.family}
              tier={offer.tier}
              name={def.name}
              text={def.tiers[offer.tier - 1].text}
              count={boonCount(worn, offer.id)}
              cap={def.cap}
              first={i === 0}
              onTake={() => take(i)}
            />
          );
        })}
      </div>
      {message && (
        <span role="alert" className="text-[18px] text-[var(--k-hot)]" data-testid="boon-refused">
          {message}
        </span>
      )}
    </section>
  );
}
