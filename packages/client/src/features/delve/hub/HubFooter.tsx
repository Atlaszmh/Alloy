import { useId, type ReactNode } from 'react';
import { isDiveActive, startDepthOptions } from '@alloy/engine';
import { applyLabel, selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Chip, Footer, Glyph, type Binding, type Prompt } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';

/** Training's inputs: T, or View on the pad. The hub binds it through usePrompts; the button draws it. */
export const TRAINING_BINDING: Binding = { key: 'KeyT', pad: 'view' };

/**
 * The hub's planks: the prompts, then Training, the start depths and the hot
 * metal Delve button (Enter with nothing focused, or Start). An unapplied chain
 * draft blocks the dive, and its block (apply, or discard and delve) sits
 * before the button. While a tab sets `action` (Skills: its Apply bar, with a
 * compact Delve), that node replaces the whole right-hand group.
 */
export function HubFooter({
  prompts,
  onTraining,
  start,
  onStart,
  onDelve,
  action,
}: {
  prompts: Prompt[];
  onTraining: () => void;
  /** The chosen start depth (the hub keeps it, for the Skills tab's Delve too). */
  start: number;
  onStart: (depth: number) => void;
  onDelve: () => void;
  action?: ReactNode;
}) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const id = useId();
  const starts = startDepthOptions(registry, profile);
  const active = isDiveActive(profile);
  // The chain builder's unapplied changes: a new dive waits until they're applied or discarded.
  // The builder's Apply, here too: its total, and the engine's op as a dry run (why it can't go).
  const view = useDelveStore(selectDraftApply);
  const blocked = Object.keys(view.changes).length > 0 && !active;
  const applying = blocked ? view.dry : null;
  const applyWhy = applying && !applying.ok ? applying.reason : null;

  const onApply = () => {
    const res = useDelveStore.getState().applyDraft();
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
  };
  const onDiscardAndDelve = () => {
    useDelveStore.getState().revertDraft();
    onDelve();
  };

  if (action) return <Footer prompts={prompts}>{action}</Footer>;

  return (
    <Footer prompts={prompts}>
      {blocked && (
        <div className="flex items-center gap-3" data-testid="draft-block">
          <div className="flex max-w-[280px] flex-col text-[14px] leading-tight">
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
            testId="draft-apply"
          >
            {applyLabel(registry, view.price)}
          </Button>
          <Button size="sm" onClick={onDiscardAndDelve} testId="draft-discard-delve">
            Discard changes &amp; delve
          </Button>
        </div>
      )}
      <Button onClick={onTraining} binding={TRAINING_BINDING} testId="training-button">
        <Glyph id="training" size={20} /> Training
      </Button>
      {!active && starts.length > 1 && (
        <div className="flex items-center gap-2" data-testid="start-depths">
          <span className="text-[14px] text-[var(--k-wood-text)]">Start at</span>
          {starts.map((d) => (
            <Chip key={d} pressed={start === d} onClick={() => onStart(d)}>
              {d}
            </Chip>
          ))}
        </div>
      )}
      <Button
        variant="primary"
        size="lg"
        onClick={onDelve}
        disabled={blocked}
        aria-describedby={blocked ? `${id}-draft` : undefined}
        binding={{ key: 'Enter', pad: 'menu' }}
        data-pad-menu
        data-pad-first
        data-primary-action="delve"
        testId="delve-button"
      >
        {active ? `Resume dive · depth ${profile.dive!.depth}` : `Delve ▸ depth ${start}`}
      </Button>
    </Footer>
  );
}
