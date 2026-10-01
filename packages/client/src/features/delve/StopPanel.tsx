import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CHAIN_SKILLS,
  GEAR_SLOTS,
  carriedByText,
  compareItem,
  editPrice,
  heroChains,
  moveKey,
  movesOf,
  movesetOf,
  pairElements,
  profileStats,
  referenceDepth,
  resolveChain,
  runeTargetOf,
  slotPrice,
  socketCap,
  socketsOf,
  takeStop,
  upgradeCost,
  withMove,
  type AbilitySlot,
  type Blow,
  type ChainSkill,
  type DiveStop,
  type GearItem,
  type Move,
  type StopAction,
  type StopKind,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { SKILL_NAME, blowText, markIdle, moveText, runeCandidates } from './chains/chain-text';
import { ChainEditor } from './chains/ChainEditor';
import { RunePicker } from './runes/RunePicker';
import { SocketRow } from './runes/SocketRow';
import { formatNumber } from './format';

/** Each power-up kind as its card says it. */
export const STOP_TEXT: Record<StopKind, { icon: string; name: string; text: string }> = {
  equip: { icon: '🛡️', name: 'Equip', text: 'Put on one item from your bag, as it is. Free.' },
  slot: { icon: '🔗', name: 'Add a slot', text: 'One more slot on a chain, for Links and scrap.' },
  move: { icon: '✎', name: 'Adjust a move', text: 'Change one move of one chain, for Mana Dust.' },
  upgrade: { icon: '⚒️', name: 'Upgrade', text: 'One forge upgrade of an item, for scrap.' },
  rune: {
    icon: '💠',
    name: 'Socket a rune',
    text: 'One rune from your pouch into an open socket. Free.',
  },
};

/**
 * The door screen's stop (see the weapon movesets spec): the power-up kinds
 * offered after the depth just cleared, as cards. A card opens its picker;
 * taking one spends the stop (the engine's `takeStop`), and skipping it is
 * choosing a door.
 */
export function StopPanel({ stop }: { stop: DiveStop }) {
  const [open, setOpen] = useState<StopKind | null>(null);
  // The card that opened the picker: closing it (the stop not taken) returns the focus there.
  const opener = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    setOpen(null);
    opener.current?.focus();
  };
  const section = useRef<HTMLElement | null>(null);
  // Taken, the cards go: the focus goes on to the next control after them (the first door).
  const taken = () => {
    setOpen(null);
    nextControl(section.current)?.focus();
  };
  if (stop.taken)
    return (
      <div className="text-center text-xs text-stone-400" data-testid="stop-taken">
        Power-up taken. On to the next depth.
      </div>
    );
  return (
    <section
      ref={section}
      className="flex w-full max-w-[520px] flex-col gap-1.5"
      data-testid="stop"
    >
      <div className="delve-display text-center text-[11px] uppercase tracking-[0.3em] text-stone-500">
        A power-up: take one, or skip it
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stop.offers.map((kind) => (
          <button
            key={kind}
            type="button"
            className="delve-panel flex flex-col items-start gap-0.5 p-2 text-left"
            onClick={(e) => {
              playSound('buttonClick');
              opener.current = e.currentTarget;
              setOpen(kind);
            }}
            data-testid={`stop-${kind}`}
          >
            <span className="delve-display text-sm font-bold text-amber-200">
              {STOP_TEXT[kind].icon} {STOP_TEXT[kind].name}
            </span>
            <span className="text-[11px] leading-snug text-stone-400">{STOP_TEXT[kind].text}</span>
          </button>
        ))}
      </div>
      {/* Over the whole screen, not the door list's scroll: the last pad scope, above the loot tray. */}
      {open &&
        createPortal(<StopPicker kind={open} onClose={close} onTaken={taken} />, document.body)}
    </section>
  );
}

/** The first enabled control after `el` in its pad scope (or the page), outside it. */
function nextControl(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const within = el.closest('[data-pad-scope]') ?? document;
  return (
    [...within.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')].find(
      (c) => !el.contains(c) && el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING,
    ) ?? null
  );
}

/**
 * One kind's picker, over the doors: what to take, with its price, then back
 * to the doors. A modal dialog: Back has the focus, and Escape closes it. A
 * portal outside `.delve-page`, so its backdrop brings the page's look along.
 */
function StopPicker({
  kind,
  onClose,
  onTaken,
}: {
  kind: StopKind;
  onClose: () => void;
  onTaken: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const take = (action: StopAction) => {
    const res = useDelveStore.getState().takeStop(action);
    if (res.ok) {
      playSound('upgradeTier');
      vibrate('success');
      showToast(`${STOP_TEXT[kind].name}: done`);
      onTaken();
    } else {
      playSound('combineFail');
      setMessage(res.reason ?? 'Cannot take it');
    }
  };
  return (
    <div
      className="delve-sheet-backdrop fixed inset-0 select-none text-white"
      onClick={onClose}
      data-testid="stop-picker"
      data-pad-scope
    >
      <div
        className="delve-sheet flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-label={STOP_TEXT[kind].name}
      >
        <div className="flex items-center justify-between">
          <span className="delve-display text-lg font-bold text-amber-200">
            {STOP_TEXT[kind].icon} {STOP_TEXT[kind].name}
          </span>
          <button
            type="button"
            className="delve-btn px-3 py-1 text-sm"
            onClick={onClose}
            autoFocus
            data-pad-back
          >
            Back
          </button>
        </div>
        {kind === 'equip' && <EquipPick take={take} />}
        {kind === 'slot' && <SlotPick take={take} />}
        {kind === 'move' && <MovePick take={take} />}
        {kind === 'upgrade' && <UpgradePick take={take} />}
        {kind === 'rune' && <RunePick take={take} />}
        {message && (
          <div className="text-xs font-semibold text-red-300" role="status">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

type Take = (action: StopAction) => void;

/** What the hero has to pay with. */
function Wallet() {
  const profile = useDelveStore((s) => s.profile);
  return (
    <div className="text-[11px] text-stone-500">
      ⚙ {formatNumber(profile.scrap)} scrap · ✦ {formatNumber(profile.manaDust)} Mana Dust · 🔗{' '}
      {profile.links} Link{profile.links === 1 ? '' : 's'}
    </div>
  );
}

/** A bag item to put on as it is (a weapon brings its own moveset). */
function EquipPick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const depth = referenceDepth(profile);
  const worn = profile.equipped.weapon;
  const { bag, equipped, pair } = profile;
  const deltas = useMemo(
    () =>
      new Map(
        bag.map((i) => [i.uid, compareItem(equipped, i, registry, depth, pair, 'asIs').powerPct]),
      ),
    [registry, bag, equipped, pair, depth],
  );
  if (profile.bag.length === 0)
    return <div className="text-xs text-stone-400">Your bag is empty.</div>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {profile.bag.map((item) => (
          <ItemTile
            key={item.uid}
            item={item}
            size={56}
            delta={deltas.get(item.uid)}
            onClick={() => take({ kind: 'equip', uid: item.uid })}
            testId="stop-equip-item"
          />
        ))}
      </div>
      {worn && profile.bag.some((i) => i.slot === 'weapon') && (
        <div className="text-[11px] text-amber-200/90" data-testid="stop-equip-weapon-note">
          A weapon brings its own moves; yours stay on {worn.name}.
        </div>
      )}
    </div>
  );
}

/** A chain of the equipped weapon to grow by a slot, at its price; one it can't take says why. */
function SlotPick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const id = useId();
  const weapon = profile.equipped.weapon;
  if (!weapon) return null;
  const { slots } = movesetOf(registry, weapon);
  const cap = registry.getDelveBalance().chains.cap;
  return (
    <div className="flex flex-col gap-1.5">
      {CHAIN_SKILLS.filter((s) => slots[s] !== undefined).map((s) => {
        const price = slotPrice(registry, weapon, s);
        // The engine's own op as a dry run: whether it goes through, and why not.
        const dry = takeStop(registry, profile, { kind: 'slot', skill: s });
        const why = !price || dry.ok ? null : dry.reason;
        return (
          <div key={s} className="flex flex-col gap-0.5">
            <button
              type="button"
              className="delve-btn text-sm"
              disabled={!dry.ok}
              onClick={() => take({ kind: 'slot', skill: s })}
              aria-describedby={why ? `${id}-${s}` : undefined}
              data-testid={`stop-slot-${s}`}
            >
              {SKILL_NAME[s]} {slots[s]}/{cap[s]}
              {price
                ? ` · + a slot · 🔗 ${price.links} · ⚙ ${formatNumber(price.scrap)}`
                : ' · every slot'}
            </button>
            {why && (
              <span id={`${id}-${s}`} className="text-[11px] text-amber-200/80">
                {why}
              </span>
            )}
          </div>
        );
      })}
      <Wallet />
    </div>
  );
}

/** The chain builder, limited to one move: the latest change replaces any earlier one. */
function MovePick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const whyId = useId();
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const [edit, setEdit] = useState<{ skill: ChainSkill; index: number; move: Move | Blow } | null>(
    null,
  );
  const saved = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  const chains = useMemo(
    () =>
      edit
        ? { ...saved, [edit.skill]: withMove(saved[edit.skill]!, edit.index, edit.move) }
        : saved,
    [saved, edit],
  );
  const stats = useMemo(
    () =>
      profileStats(registry, {
        pair,
        equipped: weapon
          ? {
              ...equipped,
              weapon: { ...weapon, moveset: { ...movesetOf(registry, weapon), chains } },
            }
          : equipped,
      }),
    [registry, equipped, pair, weapon, chains],
  );
  if (!weapon) return null;
  const changed = !!edit && moveKey(edit.move) !== moveKey(movesOf(saved[edit.skill])[edit.index]);
  const price =
    edit && changed ? editPrice(registry, profile, { [edit.skill]: chains[edit.skill] }) : 0;
  // The engine's own op as a dry run: whether the change goes through, and why not.
  const dry = edit && changed ? takeStop(registry, profile, { kind: 'move', ...edit }) : null;
  const why = dry && !dry.ok ? dry.reason : null;
  const elements = pairElements(pair);
  return (
    <div className="flex flex-col gap-2">
      <ChainEditor
        chains={chains}
        caps={movesetOf(registry, weapon).slots}
        stats={stats}
        reactionsSeen={profile.reactionsSeen}
        locked={false}
        fixedShape
        absentText={(s) => carriedByText(registry, s)}
        onChange={(skill, chain) => {
          const now = movesOf(chain);
          const shown = movesOf(chains[skill]);
          const index = now.findIndex((m, i) => !shown[i] || moveKey(m) !== moveKey(shown[i]));
          if (index >= 0) setEdit({ skill, index, move: now[index] });
        }}
        elements={elements.length > 0 ? elements : undefined}
      />
      <button
        type="button"
        className="delve-btn delve-btn-gold text-sm"
        disabled={!dry?.ok}
        onClick={() => edit && take({ kind: 'move', ...edit })}
        aria-describedby={why ? whyId : undefined}
        data-testid="stop-move-take"
      >
        {changed
          ? `Change ${SKILL_NAME[edit!.skill]}'s move ${edit!.index + 1}${price > 0 ? ` · ✦ ${price}` : ''}`
          : 'Change one move'}
      </button>
      {why && (
        <span id={whyId} className="text-[11px] text-amber-200/80">
          {why}
        </span>
      )}
      <Wallet />
    </div>
  );
}

/** An item, worn or in the bag, to upgrade once at its price. */
function UpgradePick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const items = [...GEAR_SLOTS.map((s) => profile.equipped[s]), ...profile.bag].filter(
    (i): i is GearItem => !!i && upgradeCost(registry, i) !== null,
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const cost = upgradeCost(registry, item)!;
          return (
            <div key={item.uid} className="flex flex-col items-center gap-1">
              <ItemTile
                item={item}
                size={48}
                dim={cost > profile.scrap}
                onClick={() => take({ kind: 'upgrade', uid: item.uid })}
                label={`Upgrade ${item.name} for ${cost} scrap`}
                testId="stop-upgrade-item"
              />
              <span className="text-[11px] text-stone-300">⚙ {formatNumber(cost)}</span>
            </div>
          );
        })}
      </div>
      <Wallet />
    </div>
  );
}

/**
 * Each move of the equipped weapon with an empty socket, with its sockets: tapping an empty one
 * opens the rune picker (the pouch's runes that fit the move and aren't on it), and a pick takes
 * the stop. A filled socket stays as it is: the stop never pulls.
 */
function RunePick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { equipped, pair } = profile;
  const [at, setAt] = useState<{ skill: ChainSkill; index: number; socket: number } | null>(null);
  // The pick is taken once the picker has closed (and given the focus back to its socket), so
  // the take's own move of the focus, on to the first door, comes last.
  const [chosen, setChosen] = useState<StopAction | null>(null);
  useEffect(() => {
    if (!chosen) return;
    setChosen(null);
    take(chosen);
  }, [chosen, take]);
  const chains = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [registry, equipped, pair],
  );
  const weapon = equipped.weapon;
  if (!weapon) return null;
  const rows = CHAIN_SKILLS.flatMap((skill) => {
    const chain = chains[skill];
    if (!chain) return [];
    const resolved = Array.isArray(chain)
      ? null
      : resolveChain(registry, stats, skill as AbilitySlot, chain);
    const names = Array.isArray(chain)
      ? chain.map((b) => blowText(registry, b))
      : resolved!.moves.map(moveText);
    // An ability move's ease prices its runes (a blow has none).
    return movesOf(chain).flatMap((move, index) =>
      socketsOf(move).includes(null)
        ? [{ skill, index, move, name: names[index], ease: resolved?.moves[index].ease }]
        : [],
    );
  });
  const picked = at && rows.find((r) => r.skill === at.skill && r.index === at.index);
  // An ability move's saved chain: its payment words the runes' prices (a blow has none).
  const ability =
    at && picked && picked.skill !== 'basic'
      ? { slot: picked.skill, chain: chains[picked.skill]! }
      : null;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(({ skill, index, move, name }) => (
        <div
          key={`${skill}-${index}`}
          role="group"
          aria-label={`${SKILL_NAME[skill]} · ${name}`}
          className="delve-panel flex items-center justify-between gap-2 p-2 text-sm"
          data-testid={`stop-rune-move-${skill}-${index}`}
        >
          <span>
            {SKILL_NAME[skill]} · {name}
          </span>
          <SocketRow
            runes={socketsOf(move)}
            cap={socketCap(registry, weapon.rarity)}
            nextPrice={null}
            emptyOnly
            onSocketTap={(socket) => setAt({ skill, index, socket })}
          />
        </div>
      ))}
      {at && picked && (
        <RunePicker
          candidates={markIdle(
            registry,
            stats,
            ability && { ...ability, index: at.index, socket: at.socket },
            runeCandidates(
              registry,
              runeTargetOf(weapon.baseId, picked.move),
              socketsOf(picked.move),
              profile.runes,
            ),
          )}
          on={runeTargetOf(weapon.baseId, picked.move)}
          payment={ability?.chain.payment}
          ease={picked.ease}
          onPick={(rune) => setChosen({ kind: 'rune', ...at, rune })}
          onClose={() => setAt(null)}
        />
      )}
    </div>
  );
}
