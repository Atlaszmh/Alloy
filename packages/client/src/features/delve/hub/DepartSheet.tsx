import { useId, useRef } from 'react';
import { isDiveActive, startDepthOptions, tutorialBlocksDive } from '@alloy/engine';
import { applyLabel, selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Chip, Dialog, Glyph, usePrompts, type Binding } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { useQuests } from '../quests/useQuests';

/** Training's key. The hub binds it too; in the sheet, the sheet does (a dialog is its own scope). */
export const TRAINING_BINDING: Binding = { key: 'KeyT' };

/**
 * The Depart sheet (the pad-first spec, 2.1): what the footer's Delve opens, on a click, on View
 * and on Enter. Top to bottom: the start depths (between dives, when there is a choice), the
 * tracked quests, the quests waiting to be claimed (opens Quests), whatever holds a new dive (an
 * unapplied chain draft: apply, or discard and delve; a guided start's lesson, with
 * `tutorialBlocksDive`'s reason), then Delve and Training. The first focus is Delve when it can
 * go, else the draft's Apply when that can, else the dialog's Back. A dive in progress reads
 * Resume and nothing holds it.
 */
export function DepartSheet({
  start,
  onStart,
  onDelve,
  onTraining,
  onQuests,
  onClose,
}: {
  /** The chosen start depth (the hub keeps it, for its footer's label too). */
  start: number;
  onStart: (depth: number) => void;
  /** Start (or resume) the dive. */
  onDelve: () => void;
  onTraining: () => void;
  /** Open the Quests tab (the hub closes the sheet). */
  onQuests: () => void;
  onClose: () => void;
}) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const starts = startDepthOptions(registry, profile);
  const active = isDiveActive(profile);
  const { quests } = useQuests();
  const tracked = quests.filter((q) => q.tracked && q.status !== 'claimed');
  const toClaim = quests.filter((q) => q.status === 'complete').length;
  // The chain builder's unapplied changes: a new dive waits until they're applied or discarded.
  // The builder's Apply, here too: its total, and the engine's op as a dry run (why it can't go).
  const view = useDelveStore(selectDraftApply);
  const blocked = Object.keys(view.changes).length > 0 && !active;
  const applying = blocked ? view.dry : null;
  const applyWhy = applying && !applying.ok ? applying.reason : null;
  // A guided start's Anvil lesson holds a new dive until it ends or is skipped (never a Resume).
  const lesson = active ? null : tutorialBlocksDive(registry, profile);
  const held = blocked || !!lesson;

  // The sheet's own keys (a dialog is its own scope): T, and Enter while nothing is focused (a
  // click on a start depth leaves the focus nowhere). The pad's Menu is not Delve's: no
  // `data-pad-menu` here.
  usePrompts(
    [
      { id: 'training', label: 'Training', binding: TRAINING_BINDING, onPress: onTraining },
      {
        id: 'delve',
        label: 'Delve',
        binding: { key: ['Enter', 'NumpadEnter'] },
        onPress: onDelve,
        disabled: held,
      },
    ],
    body,
  );

  const onApply = () => {
    const res = useDelveStore.getState().applyDraft();
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
  };
  const onDiscardAndDelve = () => {
    useDelveStore.getState().revertDraft();
    onDelve();
  };

  return (
    <Dialog title="Depart" onClose={onClose} width={560} testId="depart-sheet">
      <div ref={body} className="flex flex-col gap-4">
        {!active && starts.length > 1 && (
          <div className="flex items-center gap-2" data-testid="start-depths">
            <span className="k-label">Start at</span>
            {starts.map((d) => (
              <Chip key={d} pressed={start === d} onClick={() => onStart(d)}>
                {d}
              </Chip>
            ))}
          </div>
        )}
        {tracked.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="depart-tracked">
            {tracked.map((q) => (
              <li key={q.id} className="text-[16px] leading-tight text-[var(--k-text-2)]">
                <span className="text-[var(--k-hot-hi)]">{q.name}</span>
                {' · '}
                {q.objectives.find((o) => !o.done)?.text ?? 'Ready to claim'}
              </li>
            ))}
          </ul>
        )}
        {toClaim > 0 && !active && (
          <Button size="sm" onClick={onQuests} testId="claim-count">
            {toClaim} to claim
          </Button>
        )}
        {blocked && (
          <div className="flex flex-wrap items-center gap-3" data-testid="draft-block">
            <div className="flex flex-col text-[16px] leading-tight">
              <span id={`${id}-draft`} className="text-[var(--k-hot)]" data-testid="draft-warning">
                Unapplied changes: apply or discard them to delve
              </span>
              {applyWhy && (
                <span
                  id={`${id}-apply`}
                  className="text-[var(--k-bad-text)]"
                  data-testid="draft-apply-why"
                >
                  {applyWhy}
                </span>
              )}
            </div>
            <Button
              variant="go"
              size="sm"
              disabled={!applying?.ok}
              onClick={onApply}
              aria-describedby={applyWhy ? `${id}-apply` : undefined}
              data-pad-first={applying?.ok ? '' : undefined}
              testId="draft-apply"
            >
              {applyLabel(registry, view.price)}
            </Button>
            {/* A lesson holds the dive: discarding would only drop the lesson's draft. */}
            {!lesson && (
              <Button size="sm" onClick={onDiscardAndDelve} testId="draft-discard-delve">
                Discard changes &amp; delve
              </Button>
            )}
          </div>
        )}
        {lesson && (
          <span
            id={`${id}-lesson`}
            className="text-[16px] leading-tight text-[var(--k-hot)]"
            data-testid="lesson-block"
          >
            {lesson}
          </span>
        )}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={onDelve}
            disabled={held}
            aria-describedby={blocked ? `${id}-draft` : lesson ? `${id}-lesson` : undefined}
            data-pad-first={held ? undefined : ''}
            data-tutorial="hub.delve"
            testId="delve-button"
          >
            {active ? `Resume dive · depth ${profile.dive!.depth}` : `Delve ▸ depth ${start}`}
          </Button>
          <Button
            onClick={onTraining}
            binding={TRAINING_BINDING}
            data-tutorial="hub.training"
            testId="training-button"
          >
            <Glyph id="training" size={20} /> Training
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
