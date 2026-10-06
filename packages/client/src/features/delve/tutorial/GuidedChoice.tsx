import type { ReactElement } from 'react';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Dialog, PixelSprite } from '../kit';
import { getDelveRegistry } from '../registry';

/**
 * A new save's first question (see the tutorial spec), before the mana choice: Guided start
 * (`startTutorial`: Hesta walks the first two dives and two Anvil lessons) or Jump in (`onJumpIn`:
 * the save as it is). A forced kit dialog: no back, no Esc; the pad starts on Guided start.
 */
export function GuidedChoice({ onJumpIn }: { onJumpIn: () => void }): ReactElement {
  const giver = getDelveRegistry().getQuestsData().giver;
  const choose = (guided: boolean) => {
    playSound('orbConfirm');
    vibrate('success');
    if (guided) useDelveStore.getState().startTutorial();
    else onJumpIn();
  };
  return (
    <Dialog title="How do you want to begin?" width={880} testId="guided-choice">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span className="k-well flex size-[120px] shrink-0 items-center justify-center">
            <PixelSprite id={giver.sprite} scale={4} context="ui" label={giver.name} />
          </span>
          <p className="m-0 text-[18px] text-[var(--k-text-2)]">
            {giver.name}, the Anvil-keeper, can walk you through your first two dives and the forge.
            You can skip her at any time from the menu.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            className="delve-panel flex flex-col items-start gap-2 p-4 text-left"
            onClick={() => choose(true)}
            data-pad-first
            data-testid="guided-start"
          >
            <span className="text-[24px] [font-family:var(--k-font-display)]">Guided start</span>
            <span className="text-[16px] text-[var(--k-hot-hi)]">Recommended for new players</span>
            <span className="text-[18px] text-[var(--k-text)]">
              Fight, bank and forge with {giver.name} at your side: hand-built depths, one step at a
              time. Everything you find and make is yours to keep.
            </span>
          </button>
          <button
            type="button"
            className="delve-panel flex flex-col items-start gap-2 p-4 text-left"
            onClick={() => choose(false)}
            data-testid="guided-jump"
          >
            <span className="text-[24px] [font-family:var(--k-font-display)]">Jump in</span>
            <span className="text-[16px] text-[var(--k-text-3)]">You know your way around</span>
            <span className="text-[18px] text-[var(--k-text)]">
              Straight to the Anvil and the open depths, with How to delve to read.
            </span>
          </button>
        </div>
      </div>
    </Dialog>
  );
}
