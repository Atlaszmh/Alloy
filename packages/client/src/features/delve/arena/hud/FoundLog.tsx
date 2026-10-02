import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { compareItem, findItem, referenceDepth, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Panel, layerZoom } from '../../kit';
import { ItemTooltip } from '../../items/ItemTooltip';
import { deltaMark } from '../../ItemTile';
import { getDelveRegistry } from '../../registry';
import { RARITY_COLOR, RARITY_TEXT, UPGRADE_EPSILON } from '../../format';
import { countRunes } from '../../chains/chain-text';
import { FAMILY_STYLE, runeName } from '../../runes/rune-style';
import { noFocus } from './SkillSlot';

/** A row's height and the gap between rows, in design px. */
const ROW = 32;
const GAP = 6;
const ROW_CLASS =
  'flex h-8 w-full flex-none items-center gap-[10px] bg-[var(--k-well)] px-2 text-left text-[14px]';

const MARK = {
  up: { text: '▲', color: 'var(--k-ok)', label: 'upgrade' },
  down: { text: '▼', color: 'var(--k-bad)', label: 'downgrade' },
  potential: { text: '◇', color: 'var(--k-mana)', label: 'potential upgrade' },
} as const;

function Swatch({ color }: { color: string }): ReactElement {
  return <span aria-hidden className="size-[10px] flex-none" style={{ background: color }} />;
}

/**
 * "Found this floor": each pickup since the floor began, newest first (the items, then the
 * runes), as many as fit, then "+n more". An item shows its card on hover and opens on a click;
 * ▲ marks an upgrade (to equip at the Anvil), ◇ a weapon better only with your moveset moved
 * onto it (Transfer), ▼ a downgrade.
 */
export function FoundLog({ onInspect }: { onInspect: (uid: string) => void }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const diveDrops = useDelveStore((s) => s.diveDrops);
  const diveRunes = useDelveStore((s) => s.diveRunes);
  const dropsFrom = useDelveStore((s) => s.floorDropsFrom);
  const runesFrom = useDelveStore((s) => s.floorRunesFrom);
  const listRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(Infinity);
  const depth = referenceDepth(profile);

  const items = useMemo(() => {
    const out: { item: GearItem; delta: number | null; asIs: number | null }[] = [];
    for (const uid of diveDrops.slice(0, diveDrops.length - dropsFrom)) {
      const found = findItem(profile, uid);
      if (!found) continue;
      const { item } = found;
      const equipped = found.where === 'equipped';
      const value = (as: 'home' | 'asIs') =>
        compareItem(profile.equipped, item, registry, depth, profile.pair, as).powerPct;
      const delta = equipped ? null : value('home');
      // Only a weapon carries a moveset: anything else is the same either way.
      const asIs = equipped || item.slot !== 'weapon' ? delta : value('asIs');
      out.push({ item, delta, asIs });
    }
    return out;
  }, [diveDrops, dropsFrom, profile, registry, depth]);
  const runes = countRunes(diveRunes.slice(0, diveRunes.length - runesFrom));

  // As many rows as the list's height holds (its box ÷ the HUD's zoom, in design px).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height / layerZoom(el);
      if (h > 0) setFit(Math.max(1, Math.floor((h + GAP) / (ROW + GAP))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const up = (d: number | null) => d !== null && d > UPGRADE_EPSILON;
  const upgrades = items.filter((r) => up(r.asIs)).length;
  const potential = items.filter((r) => up(r.delta) && !up(r.asIs)).length;

  const rows = [
    ...items.map(({ item, delta, asIs }) => {
      const mark = deltaMark(delta, asIs);
      return (
        <ItemTooltip key={item.uid} uid={item.uid} placement="left" portal={false}>
          <button
            type="button"
            className={ROW_CLASS}
            aria-label={mark ? `${item.name}, ${MARK[mark].label}` : item.name}
            onMouseDown={noFocus}
            onClick={() => onInspect(item.uid)}
            data-testid="loot-item"
          >
            <Swatch color={RARITY_COLOR[item.rarity]} />
            <span className="truncate" style={{ color: RARITY_TEXT[item.rarity] }}>
              {item.name}
            </span>
            {mark && (
              <span className="ml-auto" style={{ color: MARK[mark].color }}>
                {MARK[mark].text}
              </span>
            )}
          </button>
        </ItemTooltip>
      );
    }),
    ...runes.map(({ rune, count }) => (
      <div key={`${rune.id}-${rune.tier}`} className={ROW_CLASS} data-testid="feed-rune">
        <Swatch color={FAMILY_STYLE[registry.getRune(rune.id).family].color} />
        <span className="truncate">
          {runeName(registry, rune)}
          {count > 1 && ` ×${count}`}
        </span>
        <span className="ml-auto text-[var(--k-text-3)]">rune</span>
      </div>
    )),
  ];
  const more = rows.length > fit ? rows.length - (fit - 1) : 0;

  return (
    <Panel
      as="div"
      material="glass"
      scroll={false}
      title="Found this floor"
      className="pointer-events-auto flex-1"
      testId="pickup-feed"
    >
      {upgrades > 0 && (
        <span className="text-[14px] text-[var(--k-ok)]" data-testid="upgrades-locked">
          ▲ {upgrades} to equip at the Anvil
        </span>
      )}
      {potential > 0 && (
        <span className="text-[14px] text-[var(--k-mana)]" data-testid="upgrades-potential">
          ◇ {potential} potential: Transfer at the Anvil
        </span>
      )}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-[6px] overflow-hidden">
        {rows.length === 0 && <span className="k-caption">Nothing found on this floor yet.</span>}
        {more > 0 ? rows.slice(0, fit - 1) : rows}
        {more > 0 && (
          <span className="k-caption flex h-8 flex-none items-center">+{more} more</span>
        )}
      </div>
    </Panel>
  );
}
