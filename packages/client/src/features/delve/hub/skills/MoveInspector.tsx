import { runeTargetOf, runeText, type ManaType } from '@alloy/engine';
import { Panel } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { RuneGlyph } from '../../runes/RuneGlyph';
import { dormantText, runeName } from '../../runes/rune-style';
import {
  KIND_HINT,
  MoveNumbers,
  NumberTable,
  blowRows,
  moveChoices,
} from '../../chains/MoveEditor';
import type { ChainEditorModel } from '../../chains/useChainEditor';
import { MoveRows } from './MoveRows';
import type { AnvilChains } from './useAnvilChains';

/**
 * The Skills tab's move pane (`ability-readout`): the chosen move, "edited" while its chain has
 * unapplied changes. With the editor shut it is the move's detail and holds no control: its
 * kind's hint, its form's line, its element's effect (off-pair marked), its sockets as text, and
 * its numbers (`moveNumbers`, `moveBeat`). `editing`: the move's editor (`MoveRows`, a nested pad
 * scope) over the numbers.
 */
export function MoveInspector({
  ed,
  anvil,
  editing,
  onClose,
}: {
  ed: ChainEditorModel;
  anvil: AnvilChains;
  editing: boolean;
  onClose: () => void;
}) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  const { move, slot, index, resolved } = ed;
  const { stats, runes } = anvil.editor;
  if (ed.absent || !move)
    return (
      <Panel as="aside" aria-label="Move inspector">
        <p className="m-0 text-[16px] text-[var(--k-text-3)]">
          This weapon doesn't carry this skill.
        </p>
      </Panel>
    );
  const { off } = moveChoices(move, slot, ed.allowed);
  const ab = resolved?.moves[index] ?? null;
  const name = (m: ManaType) => manaStyle(registry, m).name;
  const numbers = ab ? (
    <div className="k-well flex flex-col gap-2 px-3.5 py-3">
      <MoveNumbers ab={ab} full={resolved?.hold[index]?.[2] ?? null} stats={stats} pool={ed.pool} />
    </div>
  ) : (
    <div className="k-well px-3.5 py-3">
      <NumberTable rows={blowRows(stats.weapon.blows[index], stats)} />
    </div>
  );

  return (
    <Panel
      as="aside"
      aria-label={`Move ${index + 1} inspector`}
      testId="ability-readout"
      scroll={false}
    >
      {/* The pane scrolls on the right stick; a grid open in the editor scrolls it too. */}
      <div className="k-scroll flex min-h-0 flex-1 flex-col gap-4" data-pad-scroll>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="k-section m-0">
            Move {index + 1} · {ed.names[index]}
          </h2>
          {anvil.changed[ed.skill] && (
            <span className="text-[14px] text-[var(--k-text-3)]" data-testid="move-edited">
              edited
            </span>
          )}
        </div>
        {editing ? (
          <MoveRows ed={ed} anvil={anvil} onClose={onClose} />
        ) : (
          <div className="flex min-w-0 flex-col gap-2 text-[14px] text-[var(--k-text-3)]">
            <span data-testid="detail-kind">
              {'form' in move
                ? KIND_HINT[move.kind]
                : move.kind === 'hold' &&
                  'Hold the attack to charge it; automatic attacks swing it slow and hard.'}
            </span>
            {'form' in move && <span>{registry.getForm(move.form).text}</span>}
            {ab && (
              <span data-testid="element-effect">
                {ab.fusion
                  ? `${ab.fusion.name}: ${ab.fusion.text} ${name(ab.element)} sets the damage type.`
                  : slot === 'defensive'
                    ? data.elementTraits[ab.element].defensive
                    : data.elementTraits[ab.element].text}
              </span>
            )}
            {off.length > 0 && (
              <span className="text-[var(--k-hot)]" data-testid="off-pair-note">
                {off.map(name).join(' and ')} off-pair: no attunement. Keep it, or pick from your
                two elements.
              </span>
            )}
            {runes && runes.socketCap > 0 && (
              <>
                <span className="k-label" data-testid="socket-count">
                  Sockets · {ed.sockets.length} of {runes.socketCap}
                </span>
                {ed.sockets.map((r, s) => {
                  const idle = ed.dormant(index).includes(s);
                  const text = r
                    ? runeText(registry, r, runeTargetOf(runes.weaponBaseId, move), {
                        payment: ab?.payment,
                        ease: ab?.ease,
                      })
                    : null;
                  return (
                    <span
                      key={s}
                      className="flex items-center gap-3"
                      data-testid={`detail-socket-${s}`}
                    >
                      {r ? <RuneGlyph rune={r} dormant={idle} /> : <span aria-hidden>◇</span>}
                      <span className="font-semibold text-[var(--k-text-1)]">
                        {r ? runeName(registry, r) : 'Empty socket'}
                      </span>
                      {r && (
                        <span className="min-w-0 flex-1 truncate">
                          {idle ? dormantText(registry.getRune(r.id)) : text!.effect}
                        </span>
                      )}
                      {text?.cost && !idle && (
                        <span className="text-[var(--k-hot-hi)]">{text.cost}</span>
                      )}
                    </span>
                  );
                })}
              </>
            )}
          </div>
        )}
        {/* A grid scrolls the pane; the numbers under it are no stops. */}
        {numbers}
      </div>
    </Panel>
  );
}
