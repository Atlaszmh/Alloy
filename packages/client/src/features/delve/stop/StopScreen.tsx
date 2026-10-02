import { useMemo, useRef, useState, type ReactElement } from 'react';
import {
  baseDisplayName,
  compareItem,
  findItem,
  isBossDepth,
  referenceDepth,
  type DiveState,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Footer, Glyph, Panel, Screen, usePrompts, type Prompt } from '../kit';
import { getDelveRegistry } from '../registry';
import { ItemIcon } from '../ItemIcon';
import { deltaMark } from '../ItemTile';
import { ItemTooltip } from '../items/ItemTooltip';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT, formatNumber } from '../format';
import { countRunes } from '../chains/chain-text';
import { FAMILY_STYLE, runeName } from '../runes/rune-style';
import { StopPanel } from '../StopPanel';
import { DoorPane } from './DoorPane';

const MARK = {
  up: { text: '▲', color: 'var(--k-ok)', label: 'upgrade' },
  down: { text: '▼', color: 'var(--k-bad)', label: 'downgrade' },
  potential: { text: '◇', color: 'var(--k-mana)', label: 'potential upgrade' },
} as const;

const ROW = 'flex w-full flex-none items-center gap-3 bg-[var(--k-well)] px-3 py-[10px] text-left';

export interface StopScreenProps {
  dive: DiveState;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
  onPotion: () => void;
  /** The footer's Menu (Esc, the pad's Menu): the pause, over the stop. */
  onMenu: () => void;
  /** A find clicked, or Y on a focused one: the pause's Loadout, on that item. */
  onInspect: (uid: string) => void;
}

/**
 * The stop between depths, over the dimmed arena: "Depth N cleared" with the bounty and the
 * floor's finds; this floor's items and runes on the left; the power-up cards in the centre,
 * each expanding in place to its picker; the doors on the right. At its top level there is no
 * back: Esc and the pad's Menu press its Menu, which opens the pause over it.
 */
export function StopScreen({
  dive,
  onChoose,
  onExtract,
  onPotion,
  onMenu,
  onInspect,
}: StopScreenProps): ReactElement {
  const registry = getDelveRegistry();
  const biome = registry.getBiomeForDepth(dive.depth);
  const { items, runes } = useFloorFinds();
  const [skipped, setSkipped] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const stop = dive.stop;
  const offering = !!stop && !stop.taken && !skipped;
  const runeCount = runes.reduce((n, r) => n + r.count, 0);

  const prompts: Prompt[] = [
    { id: 'take', label: 'Take', binding: { mouse: 'click', pad: 'a' } },
    {
      id: 'inspect',
      label: 'Inspect item',
      binding: { mouse: 'hover', pad: 'y' },
      onPress: () => {
        const uid = (document.activeElement as HTMLElement | null)?.dataset.uid;
        if (uid) onInspect(uid);
      },
    },
    {
      id: 'skip',
      label: 'Skip power-up',
      binding: { key: 'KeyS', pad: 'x' },
      onPress: () => {
        setSkipped(true);
        mainRef.current?.querySelector<HTMLElement>('[data-door]')?.focus();
      },
      disabled: !offering,
    },
  ];
  usePrompts(prompts, mainRef);

  return (
    <Screen
      backdrop="arena-stop"
      headerStyle="bare"
      testId="door-choice"
      header={null}
      footer={
        <Footer prompts={prompts}>
          <Button
            variant="quiet"
            size="sm"
            binding={{ key: 'Escape', pad: 'menu' }}
            onClick={onMenu}
            tabIndex={-1}
            data-pad-menu
            data-pad-skip
          >
            Menu
          </Button>
        </Footer>
      }
    >
      <div ref={mainRef} className="box-border flex h-full flex-col gap-8 px-[72px]">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-[6px]">
            <span className="k-label" style={{ color: 'var(--k-mana)' }}>
              {biome.name}
            </span>
            <h1 className="k-display m-0">Depth {dive.depth} cleared</h1>
            {isBossDepth(registry, dive.depth) && (
              <span className="k-section text-[var(--k-hot-hi)]" data-testid="boss-slain">
                Boss slain · checkpoint at depth {dive.depth + 1}
              </span>
            )}
          </div>
          <div className="flex gap-9 text-[16px] text-[var(--k-text-3)]" data-testid="floor-counts">
            <span>
              <b className="k-disp text-[30px] text-[var(--k-hot-hi)]">
                {formatNumber(dive.bounty)}
              </b>{' '}
              scrap bounty
            </span>
            <span>
              <b className="k-disp text-[30px] text-[var(--k-text)]">{items.length}</b>{' '}
              {items.length === 1 ? 'item' : 'items'}
            </span>
            <span>
              <b className="k-disp text-[30px] text-[var(--k-mana)]">{runeCount}</b>{' '}
              {runeCount === 1 ? 'rune' : 'runes'}
            </span>
          </div>
        </div>
        <div
          className="grid min-h-0 flex-1 gap-7 pb-7"
          style={{ gridTemplateColumns: '380px minmax(0,1fr) 420px' }}
        >
          <Panel title="Found this floor" testId="floor-finds">
            {items.length === 0 && runes.length === 0 && (
              <span className="k-caption">Nothing found on this floor.</span>
            )}
            {items.map(({ item, delta, asIs }) => {
              const mark = deltaMark(delta, asIs);
              return (
                <ItemTooltip key={item.uid} uid={item.uid} placement="right">
                  <button
                    type="button"
                    className={ROW}
                    aria-label={mark ? `${item.name}, ${MARK[mark].label}` : item.name}
                    onClick={() => onInspect(item.uid)}
                    data-uid={item.uid}
                    data-testid="loot-item"
                  >
                    <span
                      className="size-9 flex-none border-2 p-[2px]"
                      style={{ borderColor: RARITY_COLOR[item.rarity] }}
                    >
                      <ItemIcon baseId={item.baseId} rarity={item.rarity} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate" style={{ color: RARITY_TEXT[item.rarity] }}>
                        {item.name}
                      </span>
                      <span className="k-caption">
                        {RARITY_LABEL[item.rarity]} {baseDisplayName(registry, item)}
                      </span>
                    </span>
                    {mark && (
                      <span className="ml-auto" style={{ color: MARK[mark].color }}>
                        {MARK[mark].text}
                      </span>
                    )}
                  </button>
                </ItemTooltip>
              );
            })}
            {runes.length > 0 && (
              <div className="flex flex-col gap-4" data-testid="loot-runes">
                {runes.map(({ rune, count }) => {
                  const color = FAMILY_STYLE[registry.getRune(rune.id).family].color;
                  return (
                    <div key={`${rune.id}-${rune.tier}`} className={ROW} data-testid="loot-rune">
                      <span
                        className="flex size-9 flex-none items-center justify-center border-2"
                        style={{ borderColor: color }}
                      >
                        <Glyph id="rune" size={20} color={color} />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span>
                          {runeName(registry, rune)}
                          {count > 1 && ` ×${count}`}
                        </span>
                        <span className="k-caption">Rune, to your pouch</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <span className="k-caption mt-auto">Banked when you leave this stop.</span>
          </Panel>
          <div className="flex min-w-0 flex-col">
            {!stop ? (
              <p className="k-body-2 m-0">No power-up at this stop.</p>
            ) : skipped && !stop.taken ? (
              <p className="k-body-2 m-0" data-testid="stop-skipped">
                Power-up skipped. On to the next depth.
              </p>
            ) : (
              <StopPanel stop={stop} />
            )}
          </div>
          <DoorPane dive={dive} onChoose={onChoose} onExtract={onExtract} onPotion={onPotion} />
        </div>
      </div>
    </Screen>
  );
}

/**
 * This floor's finds (decided item 21): the items since `floorDropsFrom`, newest first, each with
 * its Power change as a home for your moveset (`delta`) and as it is (`asIs`), and the runes since
 * `floorRunesFrom`, grouped.
 */
function useFloorFinds() {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const diveDrops = useDelveStore((s) => s.diveDrops);
  const diveRunes = useDelveStore((s) => s.diveRunes);
  const dropsFrom = useDelveStore((s) => s.floorDropsFrom);
  const runesFrom = useDelveStore((s) => s.floorRunesFrom);
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
  return { items, runes };
}
