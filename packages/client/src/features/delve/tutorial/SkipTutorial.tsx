import type { ReactElement } from 'react';
import { Button, Dialog } from '../kit';

/**
 * "Skip tutorial"'s confirm (the system menu, the pause and the retry screen: see the tutorial
 * spec). Back (Esc, B) keeps the guided start and has the focus; Skip tutorial drops it for good.
 */
export function SkipTutorialConfirm({
  onConfirm,
  onClose,
}: {
  onConfirm: () => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Dialog title="Skip the guided start?" onClose={onClose} width={560} testId="skip-tutorial">
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[18px] text-[var(--k-text-2)]">
          Hesta's steps stop here and the save goes on as an ordinary one: everything you found and
          made stays yours. The guided start can't be taken up again on this save.
        </p>
        <Button variant="danger" onClick={onConfirm} testId="skip-tutorial-confirm">
          Skip tutorial
        </Button>
      </div>
    </Dialog>
  );
}
