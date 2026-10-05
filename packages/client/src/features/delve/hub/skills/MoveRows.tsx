import { useState } from 'react';
import {
  MOVE_KINDS,
  runeTargetOf,
  runeText,
  type Blow,
  type ManaType,
  type Move,
  type MoveKind,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Price, Stepper } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { RuneGlyph } from '../../runes/RuneGlyph';
import { RunePicker } from '../../runes/RunePicker';
import { dormantText, runeName } from '../../runes/rune-style';
import { KIND_NAME, damageShift } from '../../chains/chain-text';
import { KIND_HINT, moveChoices } from '../../chains/MoveEditor';
import { PAYMENTS, cardAt, type ChainEditorModel } from '../../chains/useChainEditor';
import { FormPicker } from './FormPicker';
import type { AnvilChains } from './useAnvilChains';

/**
 * Every element set a move may take: each element offered, then (an ability's) each ordered
 * pair, main element first; its own set first when none of those is it.
 */
export function elementSets(
  move: Move | Blow,
  shown: readonly ManaType[],
  takes: (els: readonly ManaType[]) => boolean,
): ManaType[][] {
  const pairs =
    'form' in move ? shown.flatMap((a) => shown.filter((b) => b !== a).map((b) => [a, b])) : [];
  const sets = [...shown.map((m) => [m]), ...pairs].filter(takes);
  const own = 'element' in move ? [move.element] : move.elements;
  return sets.some((s) => s.join('+') === own.join('+')) ? sets : [own, ...sets];
}

/**
 * The Skills tab's move editor (the pad-first spec, 5): a nested pad scope of rows over the
 * chosen move. Kind, Elements, Position and the chain's Payment are steppers; Form and each socket
 * open a grid of what fits (`FormPicker`, the `RunePicker` as a grid), each option with what it
 * does to the chain's damage a second; Open a socket is a row with its price, off with the
 * engine's reason beside it. Every change is a draft edit. Back (B, Esc) and Remove are off the
 * D-pad; Back closes it onto its card. The guided start's lesson marks the Primary's last move's
 * Elements and its first move's socket rows.
 */
export function MoveRows({
  ed,
  anvil,
  onClose,
}: {
  ed: ChainEditorModel;
  anvil: AnvilChains;
  onClose: () => void;
}) {
  const registry = getDelveRegistry();
  const secondary = useDelveStore((s) => s.profile.pair.secondary);
  const [forms, setForms] = useState(false);
  const { move, index, entries, chain, slot } = ed;
  const runes = anvil.editor.runes;
  if (!move) return null;
  // Back lands on the move's card, wherever Position took it.
  const close = () => {
    onClose();
    ed.cardsRef.current?.querySelector<HTMLElement>(cardAt(index))?.focus();
  };
  const { off, shown, takes } = moveChoices(move, slot, ed.allowed);
  const name = (m: ManaType) => manaStyle(registry, m).name;
  const sets = elementSets(move, shown, takes);
  const own = ('element' in move ? [move.element] : move.elements).join('+');
  const setText = (s: ManaType[]) =>
    `${s.map(name).join(' + ')}${s.some((m) => off.includes(m)) ? ' · off-pair' : ''}`;
  const ab = ed.resolved?.moves[index] ?? null;
  const traits = registry.getArpgData().elementTraits;
  // The guided start's lesson (`l1-skills`): the Primary's last move takes the secondary, its
  // first move the rune. Each row is a target only on that move.
  const lessonLast = ed.skill === 'primary' && index === entries.length - 1;
  const lessonFirst = ed.skill === 'primary' && index === 0;
  const shape = !ed.fixedShape;

  return (
    <div className="flex flex-col gap-3" data-pad-scope data-testid="move-editor">
      <div className="flex items-center justify-between gap-2">
        <span className="k-label">Edit move {index + 1}</span>
        <span className="flex gap-2">
          <Button
            variant="quiet"
            size="sm"
            disabled={!shape || entries.length < 2}
            onClick={() => {
              onClose();
              ed.remove(index);
            }}
            aria-label={`Remove ${ed.names[index]}`}
            data-pad-skip
            testId="move-remove"
          >
            Remove
          </Button>
          <Button
            variant="quiet"
            size="sm"
            binding={{ key: 'Escape', pad: 'b' }}
            onClick={close}
            data-pad-back
            data-pad-skip
            testId="move-editor-back"
          >
            Back
          </Button>
        </span>
      </div>
      <Stepper
        label="Kind"
        testId="move-kind"
        value={move.kind}
        onChange={(k: MoveKind) => ed.edit({ ...move, kind: k })}
        options={MOVE_KINDS.map((k) => ({ id: k, label: KIND_NAME[k], text: KIND_NAME[k] }))}
        note={
          'form' in move
            ? KIND_HINT[move.kind]
            : move.kind === 'hold'
              ? 'Hold the attack to charge it; automatic attacks swing it slow and hard.'
              : undefined
        }
      />
      {'form' in move && (
        <div className="k-stepper-row">
          <span className="k-label" aria-hidden>
            Form
          </span>
          <button
            type="button"
            className="k-stepper justify-between px-3"
            aria-label={`Form: ${registry.getForm(move.form).name}`}
            onClick={() => setForms(true)}
            data-testid="move-form"
          >
            <span className="k-stepper-value">{registry.getForm(move.form).name}</span>
            <span aria-hidden>▸</span>
          </button>
        </div>
      )}
      <Stepper
        label={'form' in move ? 'Elements' : 'Element'}
        testId="move-elements"
        value={own}
        onChange={(id: string) =>
          ed.edit(
            'element' in move
              ? { ...move, element: id as ManaType }
              : { ...move, elements: id.split('+') as ManaType[] },
          )
        }
        options={sets.map((s) => ({ id: s.join('+'), label: setText(s), text: setText(s) }))}
        note={
          ab && (
            <span data-testid="element-effect">
              {ab.fusion
                ? `${ab.fusion.name}: ${ab.fusion.text} ${name(ab.element)} sets the damage type.`
                : slot === 'defensive'
                  ? traits[ab.element].defensive
                  : traits[ab.element].text}
            </span>
          )
        }
        tutorial={lessonLast ? 'skills.elements' : undefined}
        done={
          lessonLast
            ? 'elements' in move && !!secondary && move.elements.includes(secondary)
            : undefined
        }
      />
      {off.length > 0 && (
        <span className="text-[14px] text-[var(--k-hot)]" data-testid="off-pair-note">
          {off.map(name).join(' and ')} off-pair: no attunement. Keep it, or pick from your two
          elements.
        </span>
      )}
      {runes &&
        ed.sockets.map((r, s) => {
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
              <span className="font-semibold">{r ? runeName(registry, r) : 'Empty socket'}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--k-text-3)]">
                {r ? (idle ? dormantText(registry.getRune(r.id)) : text!.effect) : 'pick a rune'}
              </span>
              {text?.cost && !idle && (
                <span className="text-[14px] text-[var(--k-hot-hi)]">{text.cost}</span>
              )}
            </button>
          );
        })}
      {runes && ed.nextSocket !== undefined && (
        <>
          <button
            type="button"
            className="k-well flex items-center gap-3 px-3 py-2.5 text-left"
            disabled={!!ed.openWhy}
            onClick={ed.openSocket}
            aria-describedby={ed.openWhy ? 'socket-open-why' : undefined}
            data-testid="socket-open"
            data-tutorial={lessonFirst ? 'skills.socket' : undefined}
            data-tutorial-done={ed.sockets.length > 0}
          >
            <span className="font-semibold">Open a socket</span>
            {ed.nextSocket && (ed.nextSocket.links > 0 || ed.nextSocket.scrap > 0) && (
              <Price
                links={ed.nextSocket.links > 0 ? ed.nextSocket.links : undefined}
                scrap={ed.nextSocket.scrap > 0 ? ed.nextSocket.scrap : undefined}
              />
            )}
          </button>
          {ed.openWhy && (
            <span
              id="socket-open-why"
              className="text-[14px] text-[var(--k-hot)]"
              data-testid="socket-open-why"
            >
              {ed.openWhy}
            </span>
          )}
        </>
      )}
      {shape && entries.length > 1 && (
        <Stepper
          label="Position"
          testId="move-position"
          value={String(index)}
          onChange={(id: string) => ed.shift(index, Number(id) - index, false)}
          options={entries.map((_, j) => ({
            id: String(j),
            label: `${j + 1} of ${entries.length}`,
            text: `Position ${j + 1} of ${entries.length}`,
          }))}
        />
      )}
      {chain && shape && (
        <Stepper
          label="Payment"
          testId="chain-payment"
          value={chain.payment}
          onChange={ed.setPayment}
          options={PAYMENTS.map(([p, label]) => ({ id: p, label, text: label }))}
          note={`${PAYMENTS.find(([p]) => p === chain.payment)![2]} One payment for every move.`}
        />
      )}
      {ed.picker ? (
        <RunePicker
          {...ed.picker}
          grid
          damage={
            'form' in move
              ? (rune) =>
                  damageShift(
                    ed.dps,
                    ed.dpsWith({
                      ...move,
                      runes: ed.sockets.map((x, k) => (k === ed.socket ? rune : x)),
                    }),
                  )
              : undefined
          }
          tutorial={lessonFirst ? 'skills.rune' : undefined}
        />
      ) : forms ? (
        <FormPicker ed={ed} onClose={() => setForms(false)} />
      ) : null}
    </div>
  );
}
