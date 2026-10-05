import { useId, useLayoutEffect, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import {
  runeText,
  type AbilityPayment,
  type RunePriceTerms,
  type RuneRef,
  type RuneTarget,
  type RuneTier,
} from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { RuneGlyph } from './RuneGlyph';
import { TIERS, TIER_NUMERAL, dormantText, runeName } from './rune-style';

export interface RunePickerProps {
  /**
   * Runes that fit the move and aren't on it; count null = unlimited (Training Grounds);
   * dormant: it would do nothing in this socket (dimmed, with no price).
   */
  candidates: readonly { rune: RuneRef; count: number | null; dormant?: boolean }[];
  /** A filled socket's rune, shown with Pull. */
  current?: RuneRef | null;
  /** "Pull · destroys it", or "Pull · ⚙ 50, back to your pouch". */
  pullText?: string;
  /** Training Grounds: pick the tier in the picker (I–V chips). */
  tierChoice?: boolean;
  /** The move the socket is on: the texts follow its rules (Multi-shot's cut on a Volley). */
  on?: RuneTarget;
  /** The current rune does nothing on this move now: dimmed, with its reason. */
  dormant?: boolean;
  /** The chain's payment: each price in its words (the basic chain has none). */
  payment?: AbilityPayment;
  /** The move's `ResolvedAbility.ease`: each price eased by it. */
  ease?: number;
  /** The guided start's target the list of runes carries (`data-tutorial`): its field's, e.g. `skills.rune`. */
  tutorial?: string;
  /** A pick, then `onClose`. */
  onPick: (rune: RuneRef) => void;
  /** A pull, then `onClose`. */
  onPull?: () => void;
  onClose: () => void;
}

// How many pickers are open: an arena under one pauses (`useRunePickerOpen`).
let openPickers = 0;
const pickerListeners = new Set<() => void>();
function countPicker(by: number) {
  openPickers += by;
  pickerListeners.forEach((l) => l());
}
function onPickers(l: () => void) {
  pickerListeners.add(l);
  return () => void pickerListeners.delete(l);
}

/** Whether any rune picker is open (the Training Grounds pause the arena under one). */
export function useRunePickerOpen(): boolean {
  return useSyncExternalStore(onPickers, () => openPickers > 0);
}

/**
 * A rune's effect, its trade-off and its price, as the engine words them at its tier (and on
 * its move, in its chain's payment, eased by the move's ease). A dimmed rune shows no price,
 * and `why` (a dormant candidate's reason) after its words.
 */
function RuneEffect({
  rune,
  on,
  terms,
  dimmed = false,
  why,
  id,
}: {
  rune: RuneRef;
  on?: RuneTarget;
  terms: RunePriceTerms;
  dimmed?: boolean;
  why?: string;
  id?: string;
}) {
  const { effect, tradeoff, cost } = runeText(getDelveRegistry(), rune, on, terms);
  const price = dimmed ? null : cost;
  return (
    <span id={id} className="text-[14px] leading-snug text-stone-400">
      {effect}
      {tradeoff && ' · '}
      {tradeoff && <span className="text-amber-200/80">{tradeoff}</span>}
      {price && ' · '}
      {price && <span className="text-amber-200/80">{price}</span>}
      {why && ' · '}
      {why && <span className="text-amber-200/90">{why}</span>}
    </span>
  );
}

/**
 * A socket's picker: a filled socket's rune with Pull, then the runes that fit
 * the move and aren't on it, each with its effect, trade-off and price at its
 * tier and its count (a rune that would do nothing there dimmed, with no
 * price). The Training Grounds pick the tier here (I–V chips). Drawn in
 * place (the Skills inspector, the stop's rune pick, the Training dock), its
 * own pad scope: Back has the focus and is the pad's back, Escape closes it,
 * and closing it (a pick, a pull or Back) returns the focus to the control
 * that opened it.
 */
export function RunePicker({
  candidates,
  current = null,
  pullText,
  tierChoice = false,
  on,
  dormant = false,
  payment,
  ease,
  tutorial,
  onPick,
  onPull,
  onClose,
}: RunePickerProps) {
  const registry = getDelveRegistry();
  const id = useId();
  // The control that had the focus as the picker first rendered: its opener.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const [tier, setTier] = useState<RuneTier>(1);
  const terms: RunePriceTerms = { payment, ease };
  useLayoutEffect(() => {
    countPicker(1);
    return () => countPicker(-1);
  }, []);
  const close = () => {
    onClose();
    opener?.focus();
  };
  // With a tier choice, one row per rune, at the chosen tier.
  const rows = tierChoice
    ? candidates
        .filter((c, i) => candidates.findIndex((d) => d.rune.id === c.rune.id) === i)
        .map((c) => ({ rune: { id: c.rune.id, tier }, count: c.count, dormant: c.dormant }))
    : candidates;
  const title = current ? runeName(registry, current) : 'Socket a rune';
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  return (
    <div
      className="flex flex-col gap-3"
      role="group"
      aria-label={title}
      onKeyDown={onKeyDown}
      data-testid="rune-picker"
      data-pad-scope
    >
      <div className="flex items-center justify-between">
        <span className="delve-display text-lg font-bold text-amber-200">{title}</span>
        <button
          type="button"
          className="delve-btn px-3 py-1 text-[16px]"
          onClick={close}
          autoFocus
          data-pad-back
          data-testid="rune-picker-close"
        >
          Back
        </button>
      </div>
      {current && (
        <div className="delve-panel flex flex-col gap-1.5 p-2" data-testid="rune-current">
          <div className="flex items-center gap-2">
            <RuneGlyph rune={current} dormant={dormant} />
            <RuneEffect rune={current} on={on} terms={terms} dimmed={dormant} />
          </div>
          {dormant && (
            <span className="text-[14px] text-amber-200/90" data-testid="rune-dormant">
              {dormantText(registry.getRune(current.id))}
            </span>
          )}
          {onPull && (
            <button
              type="button"
              className="delve-btn delve-btn-danger text-[16px]"
              onClick={() => {
                onPull();
                close();
              }}
              data-testid="rune-pull"
            >
              {pullText ?? 'Pull'}
            </button>
          )}
        </div>
      )}
      {tierChoice && (
        <div className="flex flex-wrap gap-1.5">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              className="delve-chip"
              aria-pressed={tier === t}
              aria-label={`Tier ${TIER_NUMERAL[t]}`}
              onClick={() => setTier(t)}
              data-testid={`rune-tier-${t}`}
            >
              {TIER_NUMERAL[t]}
            </button>
          ))}
        </div>
      )}
      {current && rows.length > 0 && (
        <div className="delve-display text-[14px] font-bold uppercase tracking-widest text-amber-300/80">
          Replace with
        </div>
      )}
      {rows.length === 0 && (
        <div className="text-[14px] text-stone-400" data-testid="rune-none">
          {tierChoice ? 'No rune fits this move.' : 'No rune in your pouch fits this move.'}
        </div>
      )}
      <div className="flex flex-col gap-2" data-tutorial={tutorial}>
        {rows.map(({ rune, count, dormant: idle }) => {
          const key = `${rune.id}-${rune.tier}`;
          return (
            <button
              key={key}
              type="button"
              className="delve-btn flex flex-col gap-0.5 text-left text-[16px]"
              onClick={() => {
                onPick(rune);
                close();
              }}
              aria-label={`${runeName(registry, rune)}${count === null ? '' : ` ×${count}`}${idle ? ', dormant' : ''}`}
              aria-describedby={`${id}-${key}`}
              data-testid={`rune-pick-${rune.id}`}
            >
              <span className="flex items-center gap-2">
                <RuneGlyph rune={rune} dormant={idle} />
                <span className="flex-1">{runeName(registry, rune)}</span>
                {count !== null && <span className="text-[14px] text-stone-400">×{count}</span>}
              </span>
              <RuneEffect
                rune={rune}
                on={on}
                terms={terms}
                dimmed={idle}
                why={idle ? dormantText(registry.getRune(rune.id)) : undefined}
                id={`${id}-${key}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
