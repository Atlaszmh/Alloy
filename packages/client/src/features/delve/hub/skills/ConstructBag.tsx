import { MAX_SOCKETS, socketsOf } from '@alloy/engine';
import { SALVAGE_WAITS, partsText, useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Glyph, Panel } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { SocketRow } from '../../runes/SocketRow';
import { SKILL_NAME, constructText } from '../../chains/chain-text';
import type { ChainEditorModel } from '../../chains/useChainEditor';
import { useChainMessage, type AnvilChains } from './useAnvilChains';

/** The store's refusal while the draft holds changes, for the pane's title and its tests. */
export { SALVAGE_WAITS };

/**
 * Place bag construct `uid` into the chosen chain (A, or a click on its row): the model's rule,
 * its refusal said on the lane's message line. True when placed.
 */
export function placeFromBag(ed: ChainEditorModel, uid: string): boolean {
  const why = ed.place(uid);
  playSound(why ? 'combineFail' : 'orbPlace');
  useChainMessage.setState({ text: why });
  return why === null;
}

/**
 * Salvage bag construct `uid` at once (X; the constructs spec, 3.3): its runes back to the pouch
 * at the pull price, the store offering Undo for `UNDO_MS`. True when it melted.
 */
export function salvageFromBag(uid: string): boolean {
  const res = useDelveStore.getState().salvageConstruct(uid);
  playSound(res.ok ? 'orbRemove' : 'combineFail');
  if (!res.ok) showToast(res.reason ?? 'Cannot salvage it');
  else showToast(partsText(getDelveRegistry(), res.runes ?? []) ?? 'Construct salvaged');
  return res.ok;
}

/**
 * The Skills tab's bag pane (the constructs spec, 6): the move bag's constructs of the chosen
 * skill, a row each (its kind, form and elements, its sockets as marks, and, when the weapon's
 * class can't express it, why, its row off), in a kit plate (a pad group). A click or A places a
 * row (`placeFromBag`); Salvage beside it is the mouse's (X under the pad), off while the draft
 * holds changes (the engine refuses a salvage then). Locked (a dive), every row is off.
 */
export function ConstructBag({ ed, anvil }: { ed: ChainEditorModel; anvil: AnvilChains }) {
  const registry = getDelveRegistry();
  const { skill, locked, bagHere } = ed;
  const pending = Object.keys(anvil.changed).length > 0;
  return (
    <Panel as="section" aria-label="Move bag" testId="construct-bag">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="k-section m-0">Bag · {SKILL_NAME[skill]}</h2>
        <span className="k-caption text-[var(--k-text-3)]" data-testid="bag-count">
          {bagHere.length} construct{bagHere.length === 1 ? '' : 's'}
        </span>
      </div>
      {bagHere.length === 0 ? (
        <p className="k-note m-0" data-testid="bag-empty">
          Nothing for this skill. Unsocket a move to keep it here, free, with its sockets.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {bagHere.map((c) => {
            const why = anvil.editor.dormantText?.(c) ?? null;
            const el = 'element' in c ? c.element : c.elements[0];
            const color = manaStyle(registry, el).color;
            const name = constructText(registry, c);
            return (
              <li key={c.uid} className="flex items-center gap-2">
                <button
                  type="button"
                  className="k-well flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left disabled:opacity-60"
                  disabled={locked || !!why}
                  aria-label={why ? `${name}, ${why}` : `${name}: place it`}
                  onClick={() => placeFromBag(ed, c.uid!)}
                  data-construct={c.uid}
                  data-testid="bag-construct"
                >
                  <span
                    className="k-socket inline-flex h-[40px] w-[40px] flex-none items-center justify-center"
                    style={{ borderColor: color }}
                  >
                    <Glyph id={'form' in c ? c.form : 'attack'} size={22} color={color} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="k-disp truncate text-[18px]">{name}</span>
                    {why ? (
                      <span className="text-[16px] text-[var(--k-hot)]" data-testid="bag-cant">
                        {why}
                      </span>
                    ) : (
                      <SocketRow runes={socketsOf(c)} cap={MAX_SOCKETS} nextPrice={null} locked />
                    )}
                  </span>
                </button>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={locked || pending}
                  title={pending ? SALVAGE_WAITS : undefined}
                  aria-label={`Salvage ${name}`}
                  onClick={() => salvageFromBag(c.uid!)}
                  data-pad-skip
                  testId="bag-salvage"
                >
                  Salvage
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
