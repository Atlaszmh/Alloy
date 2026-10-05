import {
  MOVE_KINDS,
  runeTargetOf,
  runeText,
  type ManaType,
  type Move,
  type MoveKind,
  type FormId,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Panel, Segmented } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { RuneGlyph } from '../../runes/RuneGlyph';
import { RunePicker } from '../../runes/RunePicker';
import { dormantText, runeName } from '../../runes/rune-style';
import { KIND_NAME, listed } from '../../chains/chain-text';
import {
  KIND_HINT,
  MoveNumbers,
  NumberTable,
  blowRows,
  moveChoices,
} from '../../chains/MoveEditor';
import type { ChainEditorModel } from '../../chains/useChainEditor';
import type { AnvilChains } from './useAnvilChains';

/**
 * The Skills tab's right pane (`ability-readout`): the chosen move, "edited" while its chain has
 * unapplied changes; its kind, form (five to a row) and elements (the pair, then the fusion,
 * off-pair marked); its sockets, each a row (rune, effect, price) that opens the rune picker
 * inline, in place of the numbers; and its numbers (`moveNumbers`, `moveBeat`). A basic blow
 * takes a kind and an element only.
 */
export function MoveInspector({ ed, anvil }: { ed: ChainEditorModel; anvil: AnvilChains }) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  const { move, slot, index, locked, resolved } = ed;
  const { stats, runes } = anvil.editor;
  const secondary = useDelveStore((s) => s.profile.pair.secondary);
  if (ed.absent || !move)
    return (
      <Panel as="aside" aria-label="Move inspector">
        <p className="m-0 text-[16px] text-[var(--k-text-3)]">
          This weapon doesn't carry this skill.
        </p>
      </Panel>
    );
  const { off, shown, takes, misfits, blocking } = moveChoices(move, slot, ed.allowed);
  const set = (next: Partial<Move>) => ed.edit({ ...move, ...next } as typeof move);
  const ab = resolved?.moves[index] ?? null;
  const name = (m: ManaType) => manaStyle(registry, m).name;
  const offText = (m: ManaType) => (off.includes(m) ? ' · off-pair' : '');
  // The guided start's lesson (`l1-skills`): the Primary's last move takes the secondary, its
  // first move the rune. Each control is a target only on that move.
  const lessonLast = ed.skill === 'primary' && index === ed.entries.length - 1;
  const lessonFirst = ed.skill === 'primary' && index === 0;

  return (
    <Panel as="aside" aria-label={`Move ${index + 1} inspector`} testId="ability-readout">
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
      <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <section className="flex flex-col gap-2">
          <span className="k-label">Kind</span>
          <Segmented
            aria-label="Kind"
            value={move.kind}
            onChange={(k: MoveKind) => set({ kind: k })}
            options={MOVE_KINDS.map((k) => ({ id: k, label: KIND_NAME[k], testId: `kind-${k}` }))}
          />
          <span className="text-[14px] text-[var(--k-text-3)]">
            {'form' in move
              ? KIND_HINT[move.kind]
              : move.kind === 'hold' &&
                'Hold the attack to charge it; automatic attacks swing it slow and hard.'}
          </span>
        </section>
        {'form' in move && (
          <section className="flex flex-col gap-2">
            <span className="k-label">Form</span>
            <Segmented
              aria-label="Form"
              columns={5}
              value={move.form}
              onChange={(f: FormId) => set({ form: f })}
              options={data.forms
                .filter((f) => f.slot === slot)
                .map((f) => {
                  const out = f.id === move.form ? [] : misfits(f.id);
                  return {
                    id: f.id,
                    label: f.name,
                    disabled: out.length > 0,
                    title: out.length > 0 ? `${listed(out)} doesn't fit a ${f.name}` : f.text,
                    testId: `form-${f.id}`,
                  };
                })}
            />
            {blocking.length > 0 && (
              <span className="text-[14px] text-[var(--k-hot)]" data-testid="form-rune-note">
                {listed(blocking)} {blocking.length > 1 ? "don't" : "doesn't"} fit every form: pull{' '}
                {blocking.length > 1 ? 'them' : 'it'} to pick another.
              </span>
            )}
            <span className="text-[14px] text-[var(--k-text-3)]">
              {registry.getForm(move.form).text}
            </span>
          </section>
        )}
        <section
          className="flex flex-col gap-2"
          data-tutorial={lessonLast ? 'skills.elements' : undefined}
          data-tutorial-done={
            'elements' in move && !!secondary && move.elements.includes(secondary)
          }
        >
          <span className="k-label">{'form' in move ? 'Elements' : 'Element'}</span>
          {'element' in move ? (
            <Segmented
              aria-label="Element"
              value={move.element}
              onChange={(m: ManaType) => ed.edit({ ...move, element: m })}
              options={shown.map((m) => ({
                id: m,
                label: `${name(m)}${offText(m)}`,
                color: manaStyle(registry, m).color,
                disabled: !takes([m]),
                testId: `element-${m}`,
              }))}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Segmented
                aria-label="Elements"
                value={move.elements.join('+')}
                onChange={(id: string) => set({ elements: id.split('+') as ManaType[] })}
                options={[
                  ...shown.map((m) => ({
                    id: m,
                    label: `${name(m)}${offText(m)}`,
                    color: manaStyle(registry, m).color,
                    disabled: !takes([m]),
                    testId: `element-${m}`,
                  })),
                  // The fusion: the move's main element infused with each other one.
                  ...shown
                    .filter((m) => m !== move.elements[0])
                    .map((m) => ({
                      id: `${move.elements[0]}+${m}`,
                      label: `${name(move.elements[0])} + ${name(m)}`,
                      disabled: !takes([move.elements[0], m]),
                      testId: `infusion-${m}`,
                    })),
                ]}
              />
              {move.elements.length > 1 && (
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => set({ elements: [move.elements[1], move.elements[0]] })}
                  aria-label="Swap the main element and the infusion"
                  testId="swap-elements"
                >
                  ⇄
                </Button>
              )}
            </div>
          )}
          {ab && (
            <span className="text-[14px] text-[var(--k-text-3)]" data-testid="element-effect">
              {ab.fusion
                ? `${ab.fusion.name}: ${ab.fusion.text} ${name(ab.element)} sets the damage type.`
                : slot === 'defensive'
                  ? data.elementTraits[ab.element].defensive
                  : data.elementTraits[ab.element].text}
            </span>
          )}
          {off.length > 0 && (
            <span className="text-[14px] text-[var(--k-hot)]" data-testid="off-pair-note">
              {off.map(name).join(' and ')} off-pair: no attunement. Keep it, or pick from your two
              elements.
            </span>
          )}
        </section>
        {runes && runes.socketCap > 0 && (
          <section className="flex flex-col gap-2">
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
                <button
                  key={s}
                  type="button"
                  className="k-well flex items-center gap-3 px-3 py-2.5 text-left"
                  style={{ borderColor: ed.socket === s ? 'var(--k-mana)' : undefined }}
                  onClick={() => ed.openPicker(index, s)}
                  data-testid={`inspect-socket-${s}`}
                  data-tutorial={lessonFirst && s === 0 ? 'skills.rune' : undefined}
                  data-tutorial-done={r !== null}
                >
                  {r ? (
                    <RuneGlyph rune={r} dormant={idle} />
                  ) : (
                    <span aria-hidden className="text-[14px] text-[var(--k-steel-3)]">
                      ◇
                    </span>
                  )}
                  <span className="font-semibold">
                    {r ? runeName(registry, r) : 'Empty socket'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--k-text-3)]">
                    {r
                      ? idle
                        ? dormantText(registry.getRune(r.id))
                        : text!.effect
                      : 'pick a rune'}
                  </span>
                  {text?.cost && !idle && (
                    <span className="text-[14px] text-[var(--k-hot-hi)]">{text.cost}</span>
                  )}
                </button>
              );
            })}
          </section>
        )}
      </fieldset>
      {ed.picker ? (
        <RunePicker {...ed.picker} tutorial={lessonFirst ? 'skills.rune' : undefined} />
      ) : ab ? (
        <div className="k-well flex flex-col gap-2 px-3.5 py-3">
          <MoveNumbers
            ab={ab}
            full={resolved?.hold[index]?.[2] ?? null}
            stats={stats}
            pool={ed.pool}
          />
        </div>
      ) : (
        <div className="k-well px-3.5 py-3">
          <NumberTable rows={blowRows(stats.weapon.blows[index], stats)} />
        </div>
      )}
    </Panel>
  );
}
