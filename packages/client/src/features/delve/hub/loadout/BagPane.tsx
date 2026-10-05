import { useMemo, useState, type ReactElement } from 'react';
import {
  EQUIP_BEST_SLOTS,
  GEAR_SLOTS,
  compareItem,
  rarityIndex,
  referenceDepth,
  salvageCandidates,
  type GearItem,
  type GearSlot,
  type Rarity,
} from '@alloy/engine';
import { partsText, useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { Button, Chip, Glyph, Panel, Segmented, Tabs } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { ItemTile, deltaMark } from '../../ItemTile';
import { RARITY_COLOR, RARITY_LABEL, UPGRADE_EPSILON, formatNumber } from '../../format';
import type { BagFilter } from '../types';

type Sort = 'power' | 'rarity' | 'slot' | 'newest';
type AutoSalvage = Rarity | 'off';

interface Row {
  item: GearItem;
  /** Its place in the bag: newer items come later. */
  index: number;
  /** Power if equipped; a weapon's as a home for your moveset. */
  delta: number;
  /** A weapon's Power if equipped as it is; any other item's `delta`. */
  asIs: number;
}

const KIND: Record<Exclude<BagFilter, 'all' | 'upgrades'>, readonly GearSlot[]> = {
  weapons: ['weapon'],
  armor: ['helm', 'chest', 'gloves', 'boots'],
  jewelry: ['amulet', 'ring'],
};

const SORTS: { id: Sort; label: string; by: (a: Row, b: Row) => number }[] = [
  { id: 'power', label: 'Power', by: (a, b) => b.delta - a.delta },
  {
    id: 'rarity',
    label: 'Rarity',
    by: (a, b) =>
      rarityIndex(b.item.rarity) - rarityIndex(a.item.rarity) ||
      b.delta - a.delta ||
      b.item.ilvl - a.item.ilvl,
  },
  {
    id: 'slot',
    label: 'Slot',
    by: (a, b) => GEAR_SLOTS.indexOf(a.item.slot) - GEAR_SLOTS.indexOf(b.item.slot),
  },
  { id: 'newest', label: 'Newest', by: (a, b) => b.index - a.index },
];

/** The rarities auto-salvage can take (a legendary never melts by itself). */
const AUTO_RARITIES: Rarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic'];

/**
 * The Loadout's bag: its count, the filter tabs (LT/RT, `filter` is the Loadout's, so the hub
 * remembers it) and the sort chip, eight columns of tiles (▲ better as it
 * is, ◇ better only with your moveset moved onto it, ▼ worse, NEW, the lock), and the footer:
 * Equip best, Salvage junk and auto-salvage. A click selects a tile for the compare pane and a
 * right-click equips it; under the pad, focus selects and A takes it (`onTake`: equips, or asks how
 * to take a weapon that can take your moveset). The selected tile, else the first, is the pad's
 * first focus (`data-pad-first`).
 */
export function BagPane({
  locked,
  selected,
  filter,
  onFilter,
  onSelect,
  onHover,
  onEquip,
  onTake,
}: {
  /** Mid-dive or paused: Equip best, Salvage junk and auto-salvage wait for the Anvil. */
  locked: boolean;
  selected: string | null;
  filter: BagFilter;
  onFilter: (f: BagFilter) => void;
  onSelect: (uid: string) => void;
  onHover: (uid: string | null) => void;
  onEquip: (uid: string) => void;
  /** A under the pad: equip, or the take sheet for a weapon. */
  onTake: (uid: string) => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const newUids = useDelveStore((s) => s.newUids);
  const [sort, setSort] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const bagSize = registry.getDelveBalance().loot.bagSize;
  const { bag, equipped, pair, autoSalvage } = profile;
  const depth = referenceDepth(profile);

  const rows = useMemo<Row[]>(
    () =>
      bag.map((item, index) => {
        const delta = compareItem(equipped, item, registry, depth, pair).powerPct;
        const asIs =
          item.slot === 'weapon'
            ? compareItem(equipped, item, registry, depth, pair, 'asIs').powerPct
            : delta;
        return { item, index, delta, asIs };
      }),
    [bag, equipped, pair, registry, depth],
  );
  const isUp = (r: Row) => deltaMark(r.delta, r.asIs) === 'up';
  const upgrades = rows.filter(isUp).length;
  const shown = rows
    .filter((r) =>
      filter === 'all'
        ? true
        : filter === 'upgrades'
          ? isUp(r)
          : KIND[filter].includes(r.item.slot),
    )
    .sort(SORTS[sort].by);
  // Equip best leaves weapons alone: a weapon changes through the compare pane (Equip or Transfer).
  const best = rows.filter(
    (r) => r.delta > UPGRADE_EPSILON && EQUIP_BEST_SLOTS.includes(r.item.slot),
  ).length;
  const junk = useMemo(() => salvageCandidates(registry, profile, 'magic'), [registry, profile]);
  const upTo: AutoSalvage = [...AUTO_RARITIES].reverse().find((r) => autoSalvage[r]) ?? 'off';

  const onEquipBest = () => {
    const done = useDelveStore.getState().equipBest();
    if (done.length > 0) {
      playSound('orbConfirm');
      vibrate('success');
      showToast(`Equipped ${done.length} upgrade${done.length > 1 ? 's' : ''}`);
    }
  };

  const onSalvageJunk = () => {
    const { scrap, dust, links, runes, destroyed } = useDelveStore.getState().salvage(junk);
    if (scrap > 0) {
      playSound('gemScatter');
      vibrate('medium');
      const dustText = dust > 0 ? ` · +${formatNumber(dust)} Mana Dust` : '';
      const linkText = links > 0 ? ` · +${links} Link${links > 1 ? 's' : ''}` : '';
      const parts = partsText(registry, runes, destroyed);
      showToast(
        `Salvaged ${junk.length} items · +${formatNumber(scrap)} scrap${dustText}${linkText}${parts ? ` · ${parts}` : ''}`,
      );
    }
  };

  const onAutoSalvage = (to: AutoSalvage) => {
    const top = to === 'off' ? -1 : AUTO_RARITIES.indexOf(to);
    AUTO_RARITIES.forEach((r, i) => {
      if (autoSalvage[r] !== i <= top) useDelveStore.getState().setAutoSalvage(r, i <= top);
    });
    setChoosing(false);
  };

  return (
    <Panel
      scroll={false}
      title={
        <span className="whitespace-nowrap">
          Bag{' '}
          <span
            className={
              bag.length >= bagSize ? 'text-[var(--k-bad-text)]' : 'text-[var(--k-text-3)]'
            }
            data-testid="bag-count"
          >
            {bag.length} / {bagSize}
          </span>
        </span>
      }
      aside={
        <div className="flex flex-wrap items-center gap-2.5">
          <Tabs
            aria-label="Bag filter"
            level="sub"
            size="md"
            glyphs
            value={filter}
            onChange={(f) => {
              playSound('buttonClick');
              onFilter(f);
            }}
            tabs={[
              { id: 'all', label: 'All', testId: 'bag-filter-all' },
              { id: 'weapons', label: 'Weapons', testId: 'bag-filter-weapons' },
              { id: 'armor', label: 'Armor', testId: 'bag-filter-armor' },
              { id: 'jewelry', label: 'Jewelry', testId: 'bag-filter-jewelry' },
              {
                id: 'upgrades',
                label: (
                  <span className="flex items-center gap-1.5">
                    <Glyph id="up" size={14} /> Upgrades {upgrades}
                  </span>
                ),
                testId: 'bag-filter-upgrades',
              },
            ]}
          />
          <span className="k-caption ml-2">Sort</span>
          <Chip
            onClick={() => setSort((sort + 1) % SORTS.length)}
            aria-label={`Sorted by ${SORTS[sort].label}: next sort`}
            testId="bag-sort"
          >
            {SORTS[sort].label}
          </Chip>
        </div>
      }
      testId="bag-panel"
    >
      <div className="k-scroll min-h-0 flex-1">
        {shown.length === 0 ? (
          <p className="k-body-2 py-8 text-center">
            {bag.length === 0
              ? 'Your bag is empty. Monsters in the depths drop gear: go get some.'
              : 'Nothing in your bag fits this filter.'}
          </p>
        ) : (
          <div
            className="grid content-start gap-[14px]"
            style={{ gridTemplateColumns: 'repeat(8, minmax(56px, 84px))' }}
          >
            {shown.map(({ item, delta, asIs }, i) => (
              <ItemTile
                key={item.uid}
                item={item}
                size={84}
                className="aspect-square h-auto! w-full!"
                delta={delta}
                asIs={asIs}
                isNew={newUids[item.uid]}
                selected={selected === item.uid}
                testId="bag-item"
                data-uid={item.uid}
                data-pad-first={(selected ? item.uid === selected : i === 0) || undefined}
                data-tutorial={`loadout.bag:${item.slot}.${item.rarity}`}
                onClick={() => {
                  if (useInputDeviceStore.getState().device === 'gamepad') onTake(item.uid);
                  else {
                    playSound('orbSelect');
                    onSelect(item.uid);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onEquip(item.uid);
                }}
                onFocus={() => {
                  if (useInputDeviceStore.getState().device === 'gamepad') onSelect(item.uid);
                }}
                // Kept until another tile is hovered: the way to the compare pane leaves it.
                onMouseEnter={() => onHover(item.uid)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="go"
          disabled={best === 0 || locked}
          onClick={onEquipBest}
          testId="equip-best"
        >
          {locked ? 'Equip between dives' : `▲ Equip best${best > 0 ? ` (${best})` : ''}`}
        </Button>
        <Button
          disabled={junk.length === 0 || locked}
          onClick={onSalvageJunk}
          testId="salvage-junk"
        >
          {locked
            ? 'Salvage between dives'
            : `Salvage junk${junk.length > 0 ? ` (${junk.length})` : ''}`}
        </Button>
        <span className="k-caption ml-auto">Auto-salvage up to</span>
        <Chip
          pressed={choosing}
          disabled={locked}
          onClick={() => setChoosing(!choosing)}
          testId="auto-salvage"
        >
          {upTo === 'off' ? 'Off' : RARITY_LABEL[upTo]}
        </Chip>
      </div>
      {choosing && (
        <Segmented<AutoSalvage>
          aria-label="Auto-salvage up to"
          value={upTo}
          onChange={onAutoSalvage}
          options={[
            { id: 'off', label: 'Off', testId: 'auto-salvage-off' },
            ...AUTO_RARITIES.map((r) => ({
              id: r,
              label: RARITY_LABEL[r],
              color: RARITY_COLOR[r],
              testId: `auto-salvage-${r}`,
            })),
          ]}
        />
      )}
    </Panel>
  );
}
