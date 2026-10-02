import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import type { RuneRef } from '@alloy/engine';
import { Glyph, InputGlyph, type Binding } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { moveText } from '../../chains/chain-text';
import { FAMILY_STYLE } from '../../runes/rune-style';
import type { AbilityHud } from '../useArena';

/** A HUD slot's steel (the mockup's `.slot`); the caller sets its size and border colour. */
export const SLOT_STYLE: CSSProperties = {
  background: '#262b44',
  border: '4px solid #5a6988',
  boxShadow: '0 0 0 3px #181425, inset 0 3px 0 #8b9bb4, inset 0 -3px 0 #181425',
};

/** A press never takes the focus, so Space and the arena's keys keep reaching the fight. */
export const noFocus = (e: MouseEvent) => e.preventDefault();

const SLOT_LABEL = ['Primary', 'Defensive', 'Ultimate'];

/** Seconds Galvanize's spark stays on the slots still cooling down. */
export const GALVANIZE_SPARK = 0.4;

/** The input bound to a slot, at its bottom-right corner. */
export function BoundGlyph({ binding }: { binding: Binding }) {
  return (
    <span className="absolute -bottom-[10px] -right-[14px]">
      <InputGlyph binding={binding} size="sm" />
    </span>
  );
}

/** The runes acting on the next move or blow: a dot each in its family's colour (`data-rune`). */
export function RuneDots({ runes }: { runes: readonly RuneRef[] }) {
  if (runes.length === 0) return null;
  const registry = getDelveRegistry();
  return (
    <span className="absolute left-[6px] top-[5px] flex gap-[3px]" aria-hidden>
      {runes.map((r, k) => (
        <span
          key={k}
          data-rune={r.id}
          className="h-[6px] w-[6px]"
          style={{ background: FAMILY_STYLE[registry.getRune(r.id).family].color }}
        />
      ))}
    </span>
  );
}

/**
 * A charge filling over the slot's top edge: a hold's (`data-hold`, `data-stage` the stage
 * reached, a tick at each stage short of full power) or a channel's (no ticks).
 */
export function TickBar({ value, color, stage }: { value: number; color: string; stage?: number }) {
  const ticks =
    stage === undefined
      ? []
      : getDelveRegistry()
          .getDelveBalance()
          .chains.holdStages.filter((s) => s < 1);
  return (
    <span
      className="absolute -top-[14px] left-0 right-0 h-[6px] bg-[var(--k-well)]"
      style={{ boxShadow: '0 0 0 2px #3a4466' }}
      data-hold={stage === undefined ? undefined : ''}
      data-stage={stage}
    >
      <span
        className="block h-full"
        style={{ width: `${value * 100}%`, background: color, transition: 'width 80ms linear' }}
      />
      {ticks.map((s) => (
        <span
          key={s}
          data-tick
          className="absolute inset-y-0 w-[2px] bg-[var(--k-text)]"
          style={{ left: `${s * 100}%` }}
        />
      ))}
    </span>
  );
}

/**
 * One skill's 76 px steel slot in its element's border: the next move's form glyph, the bound
 * input, rune dots, a cooldown fill rising from the bottom with its seconds (a beat's without),
 * a hold's charge as a tick bar, Galvanize's spark, and the spends `floatPay` floats from it. A
 * click casts it auto-aimed.
 */
export function SkillSlot({
  slot,
  ab,
  busy,
  galvanized,
  binding,
  onCast,
}: {
  slot: 0 | 1 | 2;
  ab: AbilityHud;
  /** An ability is channelling or a hold is charging (presses wait for it). */
  busy: boolean;
  /** Galvanize just fired: a cooling slot sparks. */
  galvanized: boolean;
  binding: Binding;
  onCast: (slot: 0 | 1 | 2) => void;
}) {
  const color = manaStyle(getDelveRegistry(), ab.elements[0]).color;
  const cooling = ab.cooldown > 0.05;
  const frac = cooling ? Math.min(1, ab.cooldown / ab.cooldownTotal) : 0;
  // The fill glides between the HUD's refreshes while it empties, and snaps when it rises (a
  // refresh at the same height, in a pause or a hit-stop, keeps the glide going).
  const last = useRef(0);
  const glide = frac <= last.current;
  useEffect(() => {
    last.current = frac;
  });
  return (
    <button
      type="button"
      className="pointer-events-auto relative flex h-[76px] w-[76px] items-center justify-center p-0"
      style={{
        ...SLOT_STYLE,
        borderColor: color,
        opacity: busy && ab.windup === null && ab.hold === null ? 0.5 : ab.affordable ? 1 : 0.55,
      }}
      aria-label={`${SLOT_LABEL[slot]}: ${moveText({ kind: ab.nextKind, name: ab.name })}`}
      data-testid={`ability-${slot}`}
      data-ready={ab.ready}
      onMouseDown={noFocus}
      onClick={() => onCast(slot)}
    >
      <Glyph id={ab.form} size={38} color={color} />
      {frac > 0 && (
        <span
          className="absolute inset-x-0 bottom-0 bg-[rgba(24,20,37,0.78)]"
          data-sweep={ab.beat ? 'beat' : 'cooldown'}
          style={{ height: `${frac * 100}%`, transition: glide ? 'height 80ms linear' : 'none' }}
        />
      )}
      {cooling && !ab.beat && (
        <span className="k-disp absolute inset-0 flex items-center justify-center text-[26px]">
          {ab.cooldown >= 10 ? Math.ceil(ab.cooldown) : ab.cooldown.toFixed(1)}
        </span>
      )}
      <RuneDots runes={ab.runes} />
      {ab.hold !== null && <TickBar value={ab.hold.charge} color={color} stage={ab.hold.stage} />}
      {ab.windup !== null && <TickBar value={ab.windup} color={color} />}
      {galvanized && cooling && !ab.beat && (
        <span data-spark aria-hidden className="absolute -left-[10px] -top-[10px]">
          <Glyph id="galvanize" size={20} />
        </span>
      )}
      <BoundGlyph binding={binding} />
    </button>
  );
}
