import { useMemo, type ReactElement } from 'react';
import {
  carriedSkills,
  movesetTransfer,
  profileStats,
  salvageYield,
  unsocketMode,
  type ManaType,
} from '@alloy/engine';
import { partsText, pullText, runeNames, useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Glyph, Panel, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { useItemComparison } from '../../items/useItemComparison';
import { ItemHeader } from '../../items/ItemHeader';
import { PowerDelta } from '../../items/PowerDelta';
import { CompareTable } from '../../items/CompareTable';
import { ItemStatLines } from '../../items/ItemStatLines';
import { LegendaryBox } from '../../items/LegendaryBox';
import { MovesetView } from '../../items/MovesetView';
import { SKILL_NAME } from '../../chains/chain-text';
import { SLOT_LABEL, UPGRADE_EPSILON, formatDelta, manaStyle } from '../../format';
import type { HubLink } from '../types';
import { shardName } from '../forge/materials-text';
import { BindChoice, needsBind } from './BindChoice';

/** The item actions the Loadout binds to keys too (LoadoutTab owns them). */
export interface LoadoutActions {
  equip: (uid: string) => void;
  salvage: (uid: string) => void;
  lock: (uid: string) => void;
}

/**
 * The Loadout's right pane: the hovered (else selected, else worn) item against what's worn in
 * its slot: its Power change (a bag weapon's as it is and as a home for your moveset), the stat
 * table, the attunement it moves, the bind choice for gear outside the pair, a weapon's moveset
 * Transfer, and Equip, Salvage (what the engine's `salvageYield` says it gives: currency, a
 * shard, its pattern, its essence) and Lock with their gains; "Forge it ›" opens the Forge with it.
 * `full` (Shift or LT held) adds its stat lines and a weapon's moveset. Mid-dive or paused, the
 * actions give way to a note.
 */
export function ComparePane({
  uid,
  source,
  full,
  locked,
  armed,
  asked,
  actions,
  go,
}: {
  uid: string | null;
  source: 'hovered' | 'selected' | 'worn';
  full: boolean;
  locked: boolean;
  /** The precious item a first Salvage press armed. */
  armed: string | null;
  /** The item whose Equip asked to bind first. */
  asked: string | null;
  actions: LoadoutActions;
  go: (to: HubLink) => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const declined = useDelveStore((s) => s.bindDeclined);
  const unsocket = useDelveStore((s) => s.unsocket);
  const { equipped, pair } = profile;
  const attunement = useMemo(
    () => profileStats(registry, { equipped, pair }).attunement,
    [registry, equipped, pair],
  );
  const { item, worn, where, cmp, asIs } = useItemComparison(uid);

  if (!item)
    return (
      <Panel testId="item-sheet" aria-label="Compare">
        <p className="k-body-2">Nothing worn yet: hover an item in your bag to compare it.</p>
      </Panel>
    );

  const inBag = where === 'bag';
  const transfer = worn && asIs ? movesetTransfer(registry, worn, item) : null;
  // Your chains the target can't carry stay behind (their extra slots come back as Links).
  const leaves =
    worn && transfer
      ? carriedSkills(registry, worn).filter((s) => !carriedSkills(registry, item).includes(s))
      : [];
  // Equip takes a weapon as it is; Transfer is marked by its value as a home.
  const equipCmp = asIs ?? cmp;
  const isUpgrade = !!equipCmp && equipCmp.powerPct > UPGRADE_EPSILON;
  const homeUpgrade = !!transfer && !!cmp && cmp.powerPct > UPGRADE_EPSILON;
  const pull = unsocketMode(registry, unsocket);
  // What salvage gives, as the engine reckons it: only a bag item salvages, and only between dives.
  const yields = inBag && !locked ? salvageYield(registry, profile, item) : null;
  const melts = yields ? pullText(registry, yields.runes, pull) : '';
  const binding = inBag && !locked && needsBind(profile, declined, item);
  const attune = cmp ? (Object.entries(cmp.attunementDelta) as [ManaType, number][]) : [];
  const slot = SLOT_LABEL[item.slot].toLowerCase();
  const heading =
    source === 'worn'
      ? `Your ${slot}`
      : inBag
        ? `${source === 'hovered' ? 'Hovered' : 'Selected'} · compared with your ${slot}`
        : `Equipped · your ${slot}`;

  const onTransfer = () => {
    const res = useDelveStore.getState().transfer(item.uid);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot transfer');
      return;
    }
    playSound('combineMerge');
    vibrate('success');
    const links = res.links ? ` · +${res.links} Link${res.links > 1 ? 's' : ''}` : '';
    const moved = partsText(registry, res.runes, res.destroyed);
    showToast(`Your moveset moved onto ${item.name}${links}${moved ? ` · ${moved}` : ''}`);
  };

  const onUnequip = () => {
    try {
      useDelveStore.getState().unequip(item.slot);
      playSound('orbRemove');
    } catch {
      showToast('Bag is full');
    }
  };

  return (
    <Panel testId="item-sheet" aria-label="Compare" scroll={false}>
      {/* The details scroll; the actions below them stay in view. */}
      <div className="k-scroll flex min-h-0 flex-1 flex-col gap-4">
        <span className="k-label">{heading}</span>
        <div className="flex">
          <ItemHeader item={item} size="lg" />
        </div>

        {cmp && (
          <div
            className="flex flex-col gap-1"
            data-testid="item-compare"
            data-tutorial="loadout.compare"
          >
            {!cmp.replaced && <span className="k-caption">Empty slot: pure gain</span>}
            {asIs && transfer ? (
              <>
                <span className="k-label">As it is</span>
                <div data-testid="compare-as-is">
                  <PowerDelta cmp={asIs} />
                </div>
                <span className="k-label">
                  With your moveset · <Price scrap={transfer.scrap} /> to move it
                  {transfer.sockets > 0 &&
                    `, its ${transfer.sockets} socket${transfer.sockets === 1 ? '' : 's'} included`}
                </span>
                <div data-testid="compare-home">
                  <PowerDelta cmp={cmp} />
                </div>
              </>
            ) : (
              <PowerDelta cmp={cmp} />
            )}
          </div>
        )}
        {cmp && <CompareTable item={item} worn={worn} />}
        {(!cmp || full) && <ItemStatLines item={item} />}
        <LegendaryBox item={item} />
        {item.slot === 'weapon' && (!inBag || full) && <MovesetView item={item} />}

        {attune.length > 0 && (
          <p className="k-body-2 flex flex-wrap gap-x-4" data-testid="attune-delta">
            {attune.map(([m, d]) => {
              const st = manaStyle(registry, m);
              const now = attunement[m];
              return (
                <span key={m} className="inline-flex items-center gap-1.5">
                  <Glyph id={m} size={16} color={st.color} />
                  {st.name} attunement {d > 0 ? '+' : '−'}
                  {Math.abs(d)} ({now} → {now + d})
                </span>
              );
            })}
          </p>
        )}

        {binding && <BindChoice item={item} ask={asked === item.uid} />}
      </div>

      <div className="flex flex-none flex-col gap-2.5" data-testid="compare-actions">
        {transfer && !locked && (
          <div className="flex flex-col gap-1.5">
            <Button
              variant={homeUpgrade ? 'go' : 'secondary'}
              onClick={onTransfer}
              className="flex-wrap whitespace-normal"
              data-tutorial="loadout.transfer"
              testId="transfer-button"
            >
              {homeUpgrade ? '▲ ' : ''}Transfer my moveset here · <Price scrap={transfer.scrap} />
              {transfer.links > 0 && (
                <>
                  {' · '}
                  <Price links={transfer.links} signed />
                </>
              )}
            </Button>
            {leaves.length > 0 && (
              <span className="text-[14px] text-[var(--k-hot)]" data-testid="transfer-leaves">
                Leaves your {leaves.map((s) => SKILL_NAME[s]).join(' and ')} behind
              </span>
            )}
            {transfer.runes.length > 0 && (
              <span className="text-[14px] text-[var(--k-hot)]" data-testid="transfer-runes">
                {pull === 'destroy'
                  ? `Destroys ${runeNames(registry, transfer.runes)}: no socket for ${transfer.runes.length === 1 ? 'it' : 'them'} there`
                  : `${runeNames(registry, transfer.runes)} back to your pouch`}
              </span>
            )}
          </div>
        )}

        {locked ? (
          <div className="flex flex-col gap-2.5 border-[3px] border-[var(--k-wood-1)] bg-[var(--k-wood-0)] p-4">
            <span className="flex items-center gap-3">
              <Glyph id="lock" size={24} />
              <span className="k-disp text-[24px] text-[var(--k-hot)]" data-testid="equip-locked">
                Locked during the dive
              </span>
            </span>
            <span className="text-[16px] text-[var(--k-wood-text)]">
              Equip it at the Anvil between dives, or take Equip as is at the next stop.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {!inBag ? (
              <Button onClick={onUnequip} testId="unequip-button">
                Unequip
              </Button>
            ) : (
              !binding && (
                <Button
                  variant={isUpgrade ? 'go' : 'secondary'}
                  binding={{ mouse: 'rmb', pad: 'a' }}
                  onClick={() => actions.equip(item.uid)}
                  data-tutorial="loadout.equip"
                  testId="equip-button"
                >
                  Equip{equipCmp && ` · ${formatDelta(equipCmp.powerPct)} Power`}
                </Button>
              )
            )}
            {yields && (
              <Button
                variant="danger"
                binding={{ key: 'Delete', pad: 'x' }}
                disabled={item.locked}
                onClick={() => actions.salvage(item.uid)}
                data-tutorial="loadout.salvage"
                testId="salvage-button"
              >
                {armed === item.uid ? (
                  `Press again to melt${melts ? ` · ${melts}` : ''}`
                ) : (
                  <>
                    Salvage ·{' '}
                    <Price
                      scrap={yields.scrap}
                      links={yields.links > 0 ? yields.links : undefined}
                      dust={yields.dust > 0 ? yields.dust : undefined}
                      signed
                    />
                  </>
                )}
              </Button>
            )}
            {yields && (yields.shards.length > 0 || yields.pattern || yields.essence) && (
              <span
                className="flex flex-col text-[14px] text-[var(--k-text-2)]"
                data-testid="salvage-yield"
              >
                {yields.shards.length > 0 && (
                  <span>
                    Shard: {yields.shards.map((s) => shardName(registry, s)).join(' or ')}
                    {yields.shards.length > 1 &&
                      yields.extraShard > 0 &&
                      ` · ${Math.round(yields.extraShard * 100)}% for a second`}
                  </span>
                )}
                {yields.pattern && (
                  <span>Teaches the {registry.getGearBase(yields.pattern).name} pattern</span>
                )}
                {yields.essence && (
                  <span>Extracts the {registry.getLegendary(yields.essence).name} essence</span>
                )}
              </span>
            )}
            <div className="flex gap-2.5">
              <Button
                className="flex-1"
                binding={{ key: 'KeyL', pad: 'y' }}
                onClick={() => actions.lock(item.uid)}
                testId="lock-button"
              >
                {item.locked ? 'Unlock' : 'Lock'}
                {inBag && <span className="k-caption">kept from salvage</span>}
              </Button>
              <Button
                variant="quiet"
                onClick={() => go({ tab: 'forge', uid: item.uid })}
                testId="forge-it"
              >
                Forge it ›
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
