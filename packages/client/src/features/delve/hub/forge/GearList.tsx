import { useState } from 'react';
import type { GearItem, GearSlot } from '@alloy/engine';
import { Chip, Panel } from '../../kit';
import { ItemIcon } from '../../ItemIcon';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT, SLOT_LABEL } from '../../format';

type Filter = 'all' | 'weapons' | 'armor' | 'jewelry';

const FILTERS: { id: Filter; label: string; slots: readonly GearSlot[] }[] = [
  { id: 'all', label: 'All', slots: [] },
  { id: 'weapons', label: 'Weapons', slots: ['weapon'] },
  { id: 'armor', label: 'Armor', slots: ['helm', 'chest', 'gloves', 'boots'] },
  { id: 'jewelry', label: 'Jewelry', slots: ['amulet', 'ring'] },
];

/**
 * The Forge's gear: what you wear first, then the bag, one row each (`temper-row`); a row picks
 * the item for the bench, and the picked one is where the pad lands (`data-pad-first`). The kind
 * chips are the mouse's (`data-pad-skip`): the D-pad walks the rows.
 */
export function GearList({
  equipped,
  bag,
  selected,
  onSelect,
}: {
  equipped: GearItem[];
  bag: GearItem[];
  selected: string | null;
  onSelect: (uid: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const slots = FILTERS.find((f) => f.id === filter)!.slots;
  const shown = (items: GearItem[]) =>
    filter === 'all' ? items : items.filter((i) => slots.includes(i.slot));
  const rows = [
    ...shown(equipped).map((item) => ({ item, worn: true })),
    ...shown(bag).map((item) => ({ item, worn: false })),
  ];
  return (
    <Panel title="Gear" testId="gear-list">
      <div className="flex flex-wrap gap-2" data-pad-skip="">
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            testId={`gear-filter-${f.id}`}
          >
            {f.label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(({ item, worn }) => (
          <button
            key={item.uid}
            type="button"
            className="flex items-center gap-3 p-2 text-left"
            // The selected row: a hot-metal bar at its left (raised steel would fail its text's contrast).
            style={{ boxShadow: selected === item.uid ? 'inset 4px 0 0 var(--k-hot)' : undefined }}
            aria-pressed={selected === item.uid}
            data-pad-first={selected === item.uid ? '' : undefined}
            onClick={() => onSelect(item.uid)}
            data-testid="temper-row"
          >
            <span
              aria-hidden
              className="k-socket flex h-14 w-14 flex-none items-center justify-center"
              style={{ borderColor: RARITY_COLOR[item.rarity] }}
            >
              <ItemIcon baseId={item.baseId} rarity={item.rarity} size={28} />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[18px]" style={{ color: RARITY_TEXT[item.rarity] }}>
                {item.name}
              </span>
              <span className="k-caption">
                {RARITY_LABEL[item.rarity]} {SLOT_LABEL[item.slot]}
                {item.upgrade > 0 && ` · +${item.upgrade}`}
                {worn && ' · Equipped'}
              </span>
            </span>
          </button>
        ))}
        {rows.length === 0 && <p className="k-body-2">Nothing here.</p>}
      </div>
    </Panel>
  );
}
