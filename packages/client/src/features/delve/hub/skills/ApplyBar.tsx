import { Fragment, useId, type ReactNode } from 'react';
import { isDiveActive, type DataRegistry } from '@alloy/engine';
import {
  applyLabel,
  runeNames,
  selectDraftApply,
  useDelveStore,
  type DraftApply,
} from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Price, type Binding } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { DEPART_BINDING } from '../HubFooter';
import { sayRefusal } from './useAnvilChains';

/** The Apply sheet's inputs: Ctrl+Enter, or Y on the pad. */
export const APPLY_BINDING: Binding = { key: 'Enter', ctrl: true, pad: 'y' };

/** Apply the chain draft (all or nothing), with its sound. */
export function applyChains() {
  const res = useDelveStore.getState().applyDraft();
  playSound(res.ok ? 'upgradeTier' : 'combineFail');
  sayRefusal(res, 'Cannot apply');
  return res;
}

/**
 * The draft's price parts: what Apply spends (Links netted: the sockets of moves removed pay for
 * those opened), a refund beyond that, and the runes it destroys (`DraftPrice` from the engine).
 */
function priceParts(registry: DataRegistry, view: DraftApply): ReactNode[] {
  const { price } = view;
  if (!price) return [];
  const links = price.links - price.refundLinks;
  return [
    (price.dust > 0 || links > 0 || price.scrap > 0) && (
      <Price
        dust={price.dust > 0 ? price.dust : undefined}
        links={links > 0 ? links : undefined}
        scrap={price.scrap > 0 ? price.scrap : undefined}
      />
    ),
    links < 0 && <Price links={-links} signed />,
    price.destroys.length > 0 && `destroys ${runeNames(registry, price.destroys)}`,
  ].filter(Boolean);
}

/** Price parts joined by " · ". */
function joined(parts: ReactNode[]): ReactNode {
  return parts.map((p, i) => (
    <Fragment key={i}>
      {i > 0 && ' · '}
      {p}
    </Fragment>
  ));
}

/**
 * The draft's price in the words its `Price` draws, Links netted, then "destroys …"; "free" or
 * "free until your first dive" when it costs nothing; the refusal when the engine won't price it.
 * The Apply bar and the Apply sheet both say it.
 */
export function DraftPriceText({ view, firstDive }: { view: DraftApply; firstDive: boolean }) {
  const parts = priceParts(getDelveRegistry(), view);
  if (view.refused) return <span>{view.refused}</span>;
  if (parts.length > 0) return <>{joined(parts)}</>;
  return <>{firstDive ? 'free until your first dive' : 'free'}</>;
}

/**
 * The Skills tab's footer group (`chain-draft`, always shown): "n unapplied changes · price"
 * (or "No changes"), Revert, Apply with its price (with the engine's reason beside it while it
 * would be refused), and a compact Delve (the hub's `onDelve`), which opens the Depart sheet (the
 * sheet says what holds a dive, so the button never waits). Apply opens the Apply sheet
 * (`onApply`); Revert and Apply are the mouse's, off the D-pad (the pad has Y and the sheet's
 * Discard).
 */
export function ApplyBar({ onDelve, onApply }: { onDelve: () => void; onApply: () => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const view = useDelveStore(selectDraftApply);
  const id = useId();
  const n = Object.keys(view.changes).length;
  const active = isDiveActive(profile);
  const { price, refused, dry } = view;
  const applyWhy = dry && !dry.ok ? dry.reason : null;
  // Unpriced, the price says why; Apply's own reason shows only when it says something else.
  const applyNote = applyWhy && applyWhy !== refused ? applyWhy : null;
  const parts = priceParts(registry, view);

  return (
    <div className="flex items-center gap-4" data-testid="chain-draft">
      <span className="flex max-w-[420px] flex-col text-[16px] leading-tight">
        <span id={`${id}-price`} className="text-[var(--k-hot-hi)]" data-testid="chain-price">
          {n === 0 ? (
            'No changes'
          ) : (
            <>
              {n} unapplied change{n === 1 ? '' : 's'} ·{' '}
              <DraftPriceText view={view} firstDive={profile.stats.dives === 0} />
            </>
          )}
        </span>
        {applyNote && (
          <span
            id={`${id}-apply`}
            className="text-[14px] text-[var(--k-bad-text)]"
            data-testid="chain-apply-why"
          >
            {applyNote}
          </span>
        )}
      </span>
      <Button
        size="sm"
        disabled={n === 0}
        onClick={() => useDelveStore.getState().revertDraft()}
        data-pad-skip
        testId="chain-revert"
      >
        Revert
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={n === 0}
        onClick={onApply}
        binding={APPLY_BINDING}
        aria-label={applyLabel(registry, price)}
        aria-describedby={applyNote ? `${id}-apply` : applyWhy ? `${id}-price` : undefined}
        data-tutorial="skills.apply"
        data-pad-skip
        testId="chain-apply"
      >
        Apply
        {parts.length > 0 && <> · {joined(parts)}</>}
      </Button>
      <Button
        size="sm"
        onClick={onDelve}
        binding={DEPART_BINDING}
        data-pad-menu
        data-primary-action="delve"
        data-tutorial="hub.delve"
        testId="depart-button"
      >
        {active ? 'Resume' : 'Delve'}
      </Button>
    </div>
  );
}
