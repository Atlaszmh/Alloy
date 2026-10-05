import type { ReactElement } from 'react';
import { findItem, movesetTransfer, type DelveProfile, type ManaType } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Dialog, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { useItemComparison } from '../../items/useItemComparison';
import { UPGRADE_EPSILON, formatDelta } from '../../format';
import { TransferNotes, transferOnto } from './ComparePane';
import { needsBind } from './BindChoice';

/**
 * A on the bag item `uid` opens the take sheet: a bag weapon while a weapon is worn (so it can
 * take your moveset) and no bind is asked first.
 */
export function canTake(
  profile: DelveProfile,
  declined: readonly ManaType[],
  uid: string,
): boolean {
  const found = findItem(profile, uid);
  return (
    found?.where === 'bag' &&
    found.item.slot === 'weapon' &&
    !!profile.equipped.weapon &&
    !needsBind(profile, declined, found.item)
  );
}

/**
 * The pad's take sheet (the pad-first spec, 4, rule 1: a priced action gets a sheet): A on a bag
 * weapon that can take your moveset asks how to take it. Equip as it is, or Transfer my moveset
 * here (the engine's price, and what a transfer leaves); each with its Power change, the better
 * one focused first. The mouse has both in the compare pane.
 */
export function TakeSheet({
  uid,
  onClose,
}: {
  uid: string;
  onClose: () => void;
}): ReactElement | null {
  const registry = getDelveRegistry();
  const { item, worn, cmp, asIs } = useItemComparison(uid);
  if (!item || !worn || !cmp || !asIs) return null;
  const transfer = movesetTransfer(registry, worn, item);
  const homeFirst = cmp.powerPct > asIs.powerPct && cmp.powerPct > UPGRADE_EPSILON;

  const equip = () => {
    useDelveStore.getState().equip(uid);
    playSound('orbPlace');
    vibrate('medium');
    onClose();
  };
  const move = () => {
    if (transferOnto(item)) onClose();
  };

  return (
    <Dialog title={`Take ${item.name}`} onClose={onClose} width={640} testId="take-sheet">
      <div className="flex flex-col gap-3">
        <Button
          variant={homeFirst ? 'secondary' : 'go'}
          onClick={equip}
          data-pad-first={homeFirst ? undefined : ''}
          testId="take-equip"
        >
          Equip as it is · {formatDelta(asIs.powerPct)} Power
        </Button>
        <Button
          variant={homeFirst ? 'go' : 'secondary'}
          className="flex-wrap whitespace-normal"
          onClick={move}
          data-pad-first={homeFirst ? '' : undefined}
          data-tutorial="loadout.transfer"
          testId="take-transfer"
        >
          Transfer my moveset here · <Price scrap={transfer.scrap} />
          {transfer.links > 0 && (
            <>
              {' · '}
              <Price links={transfer.links} signed />
            </>
          )}{' '}
          · {formatDelta(cmp.powerPct)} Power
        </Button>
        <TransferNotes worn={worn} item={item} />
      </div>
    </Dialog>
  );
}
