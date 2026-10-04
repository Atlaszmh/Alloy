import { Fragment, useId } from 'react';
import { isDiveActive } from '@alloy/engine';
import { applyLabel, runeNames, selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Price, type Binding } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { sayRefusal } from './useAnvilChains';

/** Apply's inputs: Ctrl+Enter, or Y held on the pad. */
export const APPLY_BINDING: Binding = { key: 'Enter', ctrl: true, pad: 'y', padHold: 600 };

/** Apply the chain draft (all or nothing), with its sound. */
export function applyChains() {
  const res = useDelveStore.getState().applyDraft();
  playSound(res.ok ? 'upgradeTier' : 'combineFail');
  sayRefusal(res, 'Cannot apply');
  return res;
}

/**
 * The Skills tab's footer group (`chain-draft`, always shown): "n unapplied changes · price"
 * (or "No changes"), Revert, Apply with its price (off with the engine's reason while it would
 * be refused), and a compact Delve button (the hub's `onDelve`, at the footer's start depth),
 * which waits while changes are unapplied.
 */
export function ApplyBar({ onDelve }: { onDelve: () => void }) {
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
  // What Apply spends (Links netted: the sockets of moves removed pay for those opened), a
  // refund beyond that, and the runes it destroys.
  const links = price ? price.links - price.refundLinks : 0;
  const parts = price
    ? [
        (price.dust > 0 || links > 0 || price.scrap > 0) && (
          <Price
            dust={price.dust > 0 ? price.dust : undefined}
            links={links > 0 ? links : undefined}
            scrap={price.scrap > 0 ? price.scrap : undefined}
          />
        ),
        links < 0 && <Price links={-links} signed />,
        price.destroys.length > 0 && `destroys ${runeNames(registry, price.destroys)}`,
      ].filter(Boolean)
    : [];
  const priced = parts.map((p, i) => (
    <Fragment key={i}>
      {i > 0 && ' · '}
      {p}
    </Fragment>
  ));

  return (
    <div className="flex items-center gap-4" data-testid="chain-draft">
      <span className="flex max-w-[420px] flex-col text-[16px] leading-tight">
        <span id={`${id}-price`} className="text-[var(--k-hot-hi)]" data-testid="chain-price">
          {n === 0 ? (
            'No changes'
          ) : (
            <>
              {n} unapplied change{n === 1 ? '' : 's'} ·{' '}
              {refused ? (
                <span>{refused}</span>
              ) : parts.length > 0 ? (
                priced
              ) : profile.stats.dives === 0 ? (
                'free until your first dive'
              ) : (
                'free'
              )}
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
        testId="chain-revert"
      >
        Revert
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={!dry?.ok}
        onClick={applyChains}
        binding={APPLY_BINDING}
        aria-label={applyLabel(registry, price)}
        aria-describedby={applyNote ? `${id}-apply` : applyWhy ? `${id}-price` : undefined}
        data-tutorial="skills.apply"
        testId="chain-apply"
      >
        Apply
        {parts.length > 0 && <> · {priced}</>}
      </Button>
      <Button
        size="sm"
        onClick={onDelve}
        disabled={n > 0 && !active}
        aria-describedby={n > 0 && !active ? `${id}-price` : undefined}
        binding={{ key: 'Enter', pad: 'menu' }}
        data-pad-menu
        data-primary-action="delve"
        data-tutorial="hub.delve"
        testId="delve-button"
      >
        {active ? 'Resume' : 'Delve'}
      </Button>
    </div>
  );
}
