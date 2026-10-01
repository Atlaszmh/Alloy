import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CHAIN_SKILLS,
  GEAR_SLOTS,
  carriedByText,
  compareItem,
  editPrice,
  heroChains,
  movesetOf,
  pairElements,
  profileStats,
  referenceDepth,
  slotPrice,
  upgradeCost,
  type Blow,
  type Chains,
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
import { SKILL_NAME } from './chains/chain-text';
import { ChainEditor } from './chains/ChainEditor';
import { formatNumber } from './format';

/** Each power-up kind as its card says it. */
export const STOP_TEXT: Record<StopKind, { icon: string; name: string; text: string }> = {
  equip: { icon: '🛡️', name: 'Equip', text: 'Put on one item from your bag, as it is. Free.' },
  slot: { icon: '🔗', name: 'Add a slot', text: 'One more slot on a chain, for Links and scrap.' },
  move: { icon: '✎', name: 'Adjust a move', text: 'Change one move of one chain, for Mana Dust.' },
  upgrade: { icon: '⚒️', name: 'Upgrade', text: 'One forge upgrade of an item, for scrap.' },
};

/** A chain's moves or blows. */
function movesOf(chain: Chains[ChainSkill] | undefined): (Move | Blow)[] {
  if (!chain) return [];
  return Array.isArray(chain) ? chain : chain.moves;
}

/** `chain` with move `index` replaced by `move`. */
function withMove(chain: Chains[ChainSkill], index: number, move: Move | Blow) {
  if (Array.isArray(chain)) return chain.map((b, i) => (i === index ? (move as Blow) : b));
  return { ...chain, moves: chain.moves.map((m, i) => (i === index ? (move as Move) : m)) };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The door screen's stop (see the weapon movesets spec): the power-up kinds
 * offered after the depth just cleared, as cards. A card opens its picker;
 * taking one spends the stop (the engine's `takeStop`), and skipping it is
 * choosing a door.
 */
export function StopPanel({ stop }: { stop: DiveStop }) {
  const [open, setOpen] = useState<StopKind | null>(null);
  if (stop.taken)
    return (
      <div className="text-center text-xs text-stone-400" data-testid="stop-taken">
        Power-up taken. On to the next depth.
      </div>
    );
  return (
    <section className="flex w-full max-w-[520px] flex-col gap-1.5" data-testid="stop">
      <div className="delve-display text-center text-[11px] uppercase tracking-[0.3em] text-stone-500">
        A power-up: take one, or skip it
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stop.offers.map((kind) => (
          <button
            key={kind}
            type="button"
            className="delve-panel flex flex-col items-start gap-0.5 p-2 text-left"
            onClick={() => {
              playSound('buttonClick');
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
        createPortal(<StopPicker kind={open} onClose={() => setOpen(null)} />, document.body)}
    </section>
  );
}

/** One kind's picker, over the doors: what to take, with its price, then back to the doors. */
function StopPicker({ kind, onClose }: { kind: StopKind; onClose: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const take = (action: StopAction) => {
    const res = useDelveStore.getState().takeStop(action);
    if (res.ok) {
      playSound('upgradeTier');
      vibrate('success');
      showToast(`${STOP_TEXT[kind].name}: done`);
      onClose();
    } else {
      playSound('combineFail');
      setMessage(res.reason ?? 'Cannot take it');
    }
  };
  return (
    <div
      className="delve-sheet-backdrop"
      onClick={onClose}
      data-testid="stop-picker"
      data-pad-scope
    >
      <div
        className="delve-sheet flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
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
            data-pad-back
          >
            Back
          </button>
        </div>
        {kind === 'equip' && <EquipPick take={take} />}
        {kind === 'slot' && <SlotPick take={take} />}
        {kind === 'move' && <MovePick take={take} />}
        {kind === 'upgrade' && <UpgradePick take={take} />}
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
            delta={
              compareItem(profile.equipped, item, registry, depth, profile.pair, 'asIs').powerPct
            }
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

/** A chain of the equipped weapon to grow by a slot, at its price. */
function SlotPick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const weapon = profile.equipped.weapon;
  if (!weapon) return null;
  const { slots } = movesetOf(registry, weapon);
  const cap = registry.getDelveBalance().chains.cap;
  return (
    <div className="flex flex-col gap-1.5">
      {CHAIN_SKILLS.filter((s) => slots[s] !== undefined).map((s) => {
        const price = slotPrice(registry, weapon, s);
        const ok = !!price && price.links <= profile.links && price.scrap <= profile.scrap;
        return (
          <button
            key={s}
            type="button"
            className="delve-btn text-sm"
            disabled={!ok}
            onClick={() => take({ kind: 'slot', skill: s })}
            data-testid={`stop-slot-${s}`}
          >
            {SKILL_NAME[s]} {slots[s]}/{cap[s]}
            {price ? ` · + a slot · 🔗 ${price.links} · ⚙ ${price.scrap}` : ' · every slot'}
          </button>
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
  const changed = !!edit && !same(edit.move, movesOf(saved[edit.skill])[edit.index]);
  const price =
    edit && changed ? editPrice(registry, profile, { [edit.skill]: chains[edit.skill] }) : 0;
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
          const index = now.findIndex((m, i) => !same(m, shown[i]));
          if (index >= 0) setEdit({ skill, index, move: now[index] });
        }}
        elements={elements.length > 0 ? elements : undefined}
      />
      <button
        type="button"
        className="delve-btn delve-btn-gold text-sm"
        disabled={!changed || price > profile.manaDust}
        onClick={() => edit && take({ kind: 'move', ...edit })}
        data-testid="stop-move-take"
      >
        {changed
          ? `Change ${SKILL_NAME[edit!.skill]}'s move ${edit!.index + 1}${price > 0 ? ` · ✦ ${price}` : ''}`
          : 'Change one move'}
      </button>
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
