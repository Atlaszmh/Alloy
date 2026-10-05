import { useEffect, useId, useRef } from 'react';
import { heroChains, type ChainSkill } from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { Button, Dialog } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { SKILL_NAME } from '../../chains/chain-text';
import { DraftPriceText, applyChains } from './ApplyBar';
import { draftLines } from './draft-lines';
import { useAnvilChains } from './useAnvilChains';

/**
 * The Apply sheet (the pad-first spec, 5; rule 1: a priced action gets a sheet): each skill the
 * draft changes, its chain before and after and its notes; the price and what it destroys; and,
 * when the engine would refuse it, why. Apply (A; the first focus when it can) applies it, all or
 * nothing; Back (B) returns with the draft as it was; Discard changes reverts it. Y, Ctrl+Enter
 * and the footer's Apply open it, for every device. `skill` is the chosen skill. It closes itself
 * when the draft empties under it.
 */
export function ApplySheet({ onClose: close }: { skill: ChainSkill; onClose: () => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const view = useDelveStore(selectDraftApply);
  const { editor } = useAnvilChains();
  const id = useId();
  const saved = heroChains(registry, profile.equipped, profile.pair);
  const lines = draftLines(registry, editor.stats, saved, view.changes);
  const empty = lines.length === 0;
  // Closes once, whether by its own buttons or the draft emptying under it.
  const closed = useRef(false);
  const onClose = () => {
    if (closed.current) return;
    closed.current = true;
    close();
  };
  useEffect(() => {
    if (empty) onClose();
  });
  if (empty) return null;
  const ok = !!view.dry?.ok;
  const why = ok ? null : (view.refused ?? (view.dry && !view.dry.ok ? view.dry.reason : null));
  return (
    <Dialog title="Apply changes" onClose={onClose} width={720} testId="apply-sheet">
      <div className="flex flex-col gap-4">
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {lines.map((l) => (
            <li
              key={l.skill}
              className="k-well flex flex-col gap-1 p-3"
              data-testid={`apply-line-${l.skill}`}
            >
              <span className="k-label">{SKILL_NAME[l.skill]}</span>
              {l.before && <span className="text-[var(--k-text-3)] line-through">{l.before}</span>}
              <span>{l.after}</span>
              {l.notes.map((n) => (
                <span key={n} className="text-[14px] text-[var(--k-text-3)]">
                  {n}
                </span>
              ))}
            </li>
          ))}
        </ul>
        {/* Unpriced, the reason below says why once. */}
        {!view.refused && (
          <p className="m-0 text-[var(--k-hot-hi)]" data-testid="apply-sheet-price">
            <DraftPriceText view={view} firstDive={profile.stats.dives === 0} />
          </p>
        )}
        {why && (
          <p id={`${id}-why`} className="m-0 text-[var(--k-bad-text)]" data-testid="apply-sheet-why">
            {why}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="go"
            disabled={!ok}
            aria-describedby={why ? `${id}-why` : undefined}
            data-pad-first={ok ? '' : undefined}
            data-tutorial="skills.apply"
            onClick={() => {
              if (applyChains().ok) onClose();
            }}
            testId="apply-sheet-confirm"
          >
            Apply
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              useDelveStore.getState().revertDraft();
              onClose();
            }}
            testId="apply-sheet-discard"
          >
            Discard changes
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
