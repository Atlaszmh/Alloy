import type { ReactElement } from 'react';
import type { DiveState } from '@alloy/engine';
import type { HudMap } from '../useArenaCore';
import { FoundLog } from './FoundLog';
import { Minimap } from './Minimap';
import { PurseBar } from './PurseBar';

const nothing = () => {};

/**
 * Where the peek sits, in design px under the HUD's zoom: right of the dock (600 px wide, 24 px
 * in) and clear of the right-hand HUD. Under the lean HUD that is under the corner (its depth,
 * map, objective line and buttons, about 310 px tall), so its Map button stays in reach; under the
 * full HUD, left of the 340 px floor column and under the purse bar.
 */
const LEAN_AREA = { top: 360, left: 648, right: 24, bottom: 24 } as const;
const FULL_AREA = { top: 88, left: 648, right: 380, bottom: 24 } as const;

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
      className="delve-ui delve-hud-zoom delve-peek absolute inset-0 z-30"
      inert
      data-testid="peek-overlay"
    >
      <div
        className="absolute flex flex-col gap-4"
        style={lean ? LEAN_AREA : FULL_AREA}
        data-testid="peek-body"
      >
        {lean && (
          <div className="h-12 flex-none">
            <PurseBar dive={dive} controls={false} />
          </div>
        )}
        <div className="flex min-h-0 flex-1 gap-4">
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
