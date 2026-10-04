import { useState, type ReactElement } from 'react';
import type { TutorialTextPart } from '@alloy/engine';
import { Button, PixelSprite } from '../kit';
import { getDelveRegistry } from '../registry';
import { SkipTutorialConfirm } from './SkipTutorial';
import { TutorialParts } from './TutorialPanel';

/** Hesta's advice after a fall, the inputs drawn for the device in hand. */
const ADVICE: TutorialTextPart[] = [
  { text: 'Nothing is lost: the depth starts again as you entered it. Dodge with ' },
  { input: 'dodge' },
  { text: ' when a foe winds up, and drink a potion with ' },
  { input: 'potion' },
  { text: ' when your life runs low.' },
];

/**
 * A death while the guided start runs (see the tutorial spec), in place of the dive's summary:
 * Hesta pulls you back with a word of advice; Retry restarts the depth as it was entered, and
 * Skip tutorial (confirmed) drops the rails, and the depth starts again as an ordinary floor.
 */
export function RetryScreen({
  onRetry,
  onSkip,
}: {
  onRetry: () => void;
  onSkip: () => void;
}): ReactElement {
  const giver = getDelveRegistry().getQuestsData().giver;
  const [confirm, setConfirm] = useState(false);
  return (
    <div
      className="delve-ui delve-zoom absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8"
      style={{ background: 'rgba(6, 6, 11, 0.94)' }}
      data-testid="tutorial-retry"
      data-pad-scope
    >
      <span className="k-well flex size-[180px] items-center justify-center">
        <PixelSprite id={giver.sprite} scale={6} context="ui" label={giver.name} />
      </span>
      <h1 className="k-display m-0 text-[var(--k-hot-hi)]">{giver.name} pulls you back</h1>
      <p className="m-0 flex max-w-[720px] flex-wrap items-center justify-center gap-x-[6px] gap-y-1 text-center text-[18px] text-[var(--k-text-2)]">
        <TutorialParts parts={ADVICE} />
      </p>
      <div className="flex w-[560px] flex-col gap-3">
        <Button variant="primary" size="lg" onClick={onRetry} data-pad-first testId="retry-depth">
          Retry this depth
        </Button>
        <Button onClick={() => setConfirm(true)} testId="retry-skip-tutorial">
          Skip tutorial
        </Button>
      </div>
      {confirm && (
        <SkipTutorialConfirm
          onConfirm={() => {
            setConfirm(false);
            onSkip();
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
