import { useMemo } from 'react';
import {
  takeStop,
  type DelveProfile,
  type ProfileActionResult,
  type StopAction,
  type StopKind,
} from '@alloy/engine';
import { Button, Dialog } from '../kit';
import { StopPanel, type StopOps } from '../StopPanel';
import { getDelveRegistry } from '../registry';

/**
 * The exit gate's confirm (see the floor maps spec): the arena waits under it; Leave takes the
 * exit, Back (Esc or B) stays on the floor. Back takes the focus, so a second press of the
 * gate's button never leaves by accident.
 */
export function ExitConfirm({
  unexplored,
  onLeave,
  onStay,
}: {
  /** Rooms not yet revealed (`exitRequest.roomsUnexplored`). */
  unexplored: number;
  onLeave: () => void;
  onStay: () => void;
}) {
  return (
    <Dialog
      title="Leave the floor?"
      onClose={onStay}
      width={560}
      testId="exit-confirm"
      footer={
        <Button variant="go" onClick={onLeave} testId="exit-leave">
          Leave the floor
        </Button>
      }
    >
      <p className="m-0 text-[18px]" data-testid="exit-unexplored">
        {unexplored === 0
          ? 'Every room explored.'
          : `${unexplored} ${unexplored === 1 ? 'room' : 'rooms'} unexplored.`}
      </p>
      <p className="k-body-2 m-0">Loot left on the floor is lost.</p>
    </Dialog>
  );
}

/** `profile` at a stop offering `offers`: the alcove's dry runs ask the stop's own op, whose rules it shares. */
function atStop(profile: DelveProfile, offers: StopKind[]): DelveProfile {
  return profile.dive
    ? {
        ...profile,
        dive: {
          ...profile.dive,
          phase: 'choosing',
          stop: { kind: 'powerups', offers, taken: false },
        },
      }
    : profile;
}

/**
 * An Anvil alcove (see the floor maps spec): the stop's power-up cards over its `offers`, taken
 * with `onTake` (the engine's `takeAlcove`, through the dive). A take closes it; Back leaves the
 * alcove unused, to open again.
 */
export function AlcoveDialog({
  offers,
  onTake,
  onClose,
}: {
  offers: StopKind[];
  onTake: (action: StopAction) => ProfileActionResult;
  onClose: () => void;
}) {
  const ops = useMemo<StopOps>(() => {
    const registry = getDelveRegistry();
    return {
      dry: (profile, action) => takeStop(registry, atStop(profile, offers), action),
      take: (action) => {
        const res = onTake(action);
        if (res.ok) onClose();
        return res;
      },
    };
  }, [offers, onTake, onClose]);
  return (
    <Dialog title="Anvil alcove" onClose={onClose} width={1120} testId="alcove-dialog">
      <StopPanel stop={{ kind: 'powerups', offers, taken: false }} ops={ops} />
    </Dialog>
  );
}
