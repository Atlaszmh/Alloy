import type { ReactElement } from 'react';
import type { DiveState } from '@alloy/engine';
import type { HudMap } from '../useArenaCore';
import { FoundLog } from './FoundLog';
import { Minimap } from './Minimap';
import { PurseBar } from './PurseBar';

const nothing = () => {};

/**
 * The peek (the pad-first spec, 3): over the running fight, the large map and, under the lean HUD,
 * the purse with this dive's gains and the floor's finds (the full HUD shows those already). It is
 * `inert` and passes every pointer event through (`.delve-peek`), so the fight's clicks and aim
 * reach the arena under it.
 */
export function PeekOverlay({
  dive,
  map,
  lean,
}: {
  dive: DiveState;
  map: HudMap | null;
  lean: boolean;
}): ReactElement {
  return (
    <div
      className="delve-ui delve-hud-zoom delve-peek absolute inset-0 z-30 grid place-items-center"
      inert
      data-testid="peek-overlay"
    >
      <div className="flex w-[1400px] max-w-[calc(100%-48px)] flex-col gap-4">
        {lean && (
          <div className="h-12">
            <PurseBar dive={dive} controls={false} />
          </div>
        )}
        <div className="flex h-[680px] gap-4">
          <div className="k-glass min-w-0 flex-1 p-4">
            <Minimap map={map} large />
          </div>
          {lean && (
            <div className="flex w-[380px] flex-none flex-col">
              <FoundLog onInspect={nothing} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
