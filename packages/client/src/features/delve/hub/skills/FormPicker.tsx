import { useState } from 'react';
import { formAllowed, type Move } from '@alloy/engine';
import { Button, Glyph } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';
import { damageShift, listed } from '../../chains/chain-text';
import { moveChoices } from '../../chains/MoveEditor';
import type { ChainEditorModel } from '../../chains/useChainEditor';

/**
 * The move editor's form grid (a nested pad scope): every form of the move's slot the weapon's class can express, two to a row,
 * each its glyph, name, line and what it does to the chain's damage a second; a form a socketed
 * rune doesn't fit is off and says why beside itself. A pick sets the form and closes it; Back (B,
 * Esc) closes it; either way the focus returns to the Form row.
 */
export function FormPicker({ ed, onClose }: { ed: ChainEditorModel; onClose: () => void }) {
  const registry = getDelveRegistry();
  const move = ed.move as Move;
  // The control that opened the grid: the Form row.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const close = () => {
    onClose();
    opener?.focus();
  };
  const { misfits } = moveChoices(move, ed.slot, ed.allowed);
  return (
    <div className="flex flex-col gap-3" data-pad-scope data-testid="form-picker">
      <div className="flex items-center justify-between">
        <span className="k-label">Form</span>
        <Button
          variant="quiet"
          size="sm"
          binding={{ key: 'Escape', pad: 'b' }}
          onClick={close}
          data-pad-back
          data-pad-skip
          testId="form-picker-back"
        >
          Back
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {registry
          .getArpgData()
          // The slot's forms the weapon's class can express (the constructs spec, 2.1).
          .forms.filter((f) => f.slot === ed.slot && formAllowed(registry, ed.weaponBaseId, f.id))
          .map((f) => {
            const out = f.id === move.form ? [] : misfits(f.id);
            const shift = damageShift(ed.dps, ed.dpsWith({ ...move, form: f.id }));
            return (
              <button
                key={f.id}
                type="button"
                className="k-well flex flex-col gap-1 p-3 text-left disabled:opacity-60"
                aria-pressed={f.id === move.form}
                disabled={out.length > 0}
                autoFocus={f.id === move.form}
                data-pad-first={f.id === move.form ? '' : undefined}
                onClick={() => {
                  ed.edit({ ...move, form: f.id });
                  close();
                }}
                data-testid={`form-${f.id}`}
              >
                <span className="flex items-center gap-2">
                  <Glyph id={f.id} size={20} />
                  <span className="k-disp text-[18px]">{f.name}</span>
                </span>
                <span className="k-note">{f.text}</span>
                {out.length > 0 ? (
                  <span className="text-[16px] text-[var(--k-hot)]">
                    {listed(out)} doesn't fit a {f.name}
                  </span>
                ) : (
                  shift && (
                    <span className="text-[16px]" data-testid={`form-damage-${f.id}`}>
                      {shift}
                    </span>
                  )
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}
