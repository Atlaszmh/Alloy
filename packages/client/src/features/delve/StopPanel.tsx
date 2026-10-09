import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  CHAIN_SKILLS,
  GEAR_SLOTS,
  MAX_SOCKETS,
  compareItem,
  editPrice,
  moveKey,
  movesOf,
  movesetOf,
  pairElements,
  profileStats,
  referenceDepth,
  resolveChain,
  runeTargetOf,
  slotPrice,
  slotRange,
  socketsOf,
  takeStop,
  upgradeCost,
  withMove,
  type AbilitySlot,
  type Blow,
  type ChainSkill,
  type DataRegistry,
  type DelveProfile,
  type PowerupStop,
  type GearItem,
  type Move,
  type ProfileActionResult,
  type StopAction,
  type StopKind,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Glyph, Price, type GlyphId } from './kit';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { slotsText } from './items/weapon-frame';
import { SKILL_NAME, blowText, markIdle, moveText, runeCandidates } from './chains/chain-text';
import { ChainEditor } from './chains/ChainEditor';
import { RunePicker } from './runes/RunePicker';
import { SocketRow } from './runes/SocketRow';
import { useUIStore } from '@/stores/uiStore';

/** Each power-up kind as its card says it: its glyph, its name, what it does and what it costs. */
export const STOP_TEXT: Record<
  StopKind,
  { glyph: GlyphId; name: string; text: string; price: string }
> = {
  equip: {
    glyph: 'up',
    name: 'Equip',
    text: 'Put on one item from your bag, as it is.',
    price: 'Free',
  },
  slot: {
    glyph: 'link',
    name: 'Add a slot',
    text: 'One more slot on a chain, up to its ceiling.',
    price: 'Links and scrap',
  },
  move: {
    glyph: 'dust',
    name: 'Adjust a move',
    text: 'Change one move of one chain.',
    price: 'Mana Dust',
  },
  upgrade: {
    glyph: 'anvil',
    name: 'Upgrade',
    text: 'One forge upgrade of an item.',
    price: 'Scrap',
  },
  rune: {
    glyph: 'rune',
    name: 'Socket a rune',
    text: 'One rune from your pouch into an open socket.',
    price: 'Free',
  },
};

/** What a stop's pickers run: the op as a dry run (whether it goes through, and why not), and the take. */
export interface StopOps {
  dry: (profile: DelveProfile, action: StopAction) => ProfileActionResult;
  take: (action: StopAction) => ProfileActionResult;
}

/** The stop's own: the engine's `takeStop`, the take through the store. */
const STOP_OPS: StopOps = {
  dry: (profile, action) => takeStop(getDelveRegistry(), profile, action),
  take: (action) => useDelveStore.getState().takeStop(action),
};

/**
 * The stop's power-ups (see the weapon movesets spec): the kinds offered after the depth just
 * cleared, as plate cards. A card expands in place to its picker, its own pad scope with a Back;
 * taking one spends the stop (the engine's `takeStop`), and skipping it is choosing a door. The
 * Anvil alcove (see the floor maps spec) shows the same cards over its own `ops`.
 */
export function StopPanel({ stop, ops = STOP_OPS }: { stop: PowerupStop; ops?: StopOps }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const upgradeCosts = upgradable(registry, profile).map((i) => upgradeCost(registry, i)!);
  const [open, setOpen] = useState<StopKind | null>(null);
  const section = useRef<HTMLElement | null>(null);
  // Back (the stop not taken): the cards come back, and the focus goes to the one that opened it.
  const close = () => {
    const kind = open;
    flushSync(() => setOpen(null));
    section.current?.querySelector<HTMLElement>(`[data-testid="stop-${kind}"]`)?.focus();
  };
  // Taken, the cards go: the focus goes on to the next control after them (the first door).
  const taken = () => {
    setOpen(null);
    nextControl(section.current)?.focus();
  };
  if (stop.taken)
    return (
      <p className="k-body-2 m-0" data-testid="stop-taken">
        Power-up taken. On to the next depth.
      </p>
    );
  return (
    <section
      ref={section}
      aria-label="Power-up"
      className="flex min-h-0 flex-1 flex-col gap-4"
      data-testid="stop"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="k-section m-0 text-[26px] text-[var(--k-hot-hi)]">Take one power-up</h2>
        <span className="text-[16px] text-[var(--k-text-3)]">or skip it</span>
      </div>
      {open ? (
        <StopPicker kind={open} onClose={close} onTaken={taken} ops={ops} />
      ) : (
        <div className="grid min-h-0 grid-cols-3 items-start gap-[18px]">
          {stop.offers.map((kind, i) => (
            <button
              key={kind}
              type="button"
              className="k-plate flex flex-col gap-[14px] p-6 text-left text-[var(--k-text)]"
              onClick={() => {
                playSound('buttonClick');
                setOpen(kind);
              }}
              data-pad-first={i === 0 || undefined}
              data-primary-action={i === 0 ? 'powerup' : undefined}
              data-testid={`stop-${kind}`}
              data-tutorial={`stop.card:${kind}`}
            >
              <Glyph id={STOP_TEXT[kind].glyph} size={32} />
              <span className="k-disp text-[30px]">{STOP_TEXT[kind].name}</span>
              <span className="text-[18px] leading-normal text-[var(--k-text-2)]">
                {STOP_TEXT[kind].text}
              </span>
              <span className="mt-auto flex justify-between gap-2 bg-[var(--k-well)] px-[14px] py-3 text-[16px]">
                <span className="text-[var(--k-text-3)]">Price</span>
                <b className="text-[var(--k-hot-hi)]" data-testid="stop-price">
                  {kind === 'upgrade' && upgradeCosts.length > 0 ? (
                    <>
                      {new Set(upgradeCosts).size > 1 && 'from '}
                      <Price scrap={Math.min(...upgradeCosts)} />
                    </>
                  ) : (
                    STOP_TEXT[kind].price
                  )}
                </b>
              </span>
            </button>
          ))}
        </div>
      )}
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
 * One kind's picker, in place of the cards: what to take, with its price. Its own pad scope:
 * Back has the focus and is the pad's back, and Escape closes it.
 */
function StopPicker({
  kind,
  onClose,
  onTaken,
  ops,
}: {
  kind: StopKind;
  onClose: () => void;
  onTaken: () => void;
  ops: StopOps;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const take = (action: StopAction) => {
    const res = ops.take(action);
    if (res.ok) {
      playSound('upgradeTier');
      vibrate('success');
      showToast(`${STOP_TEXT[kind].name}: done`);
      // The stop's onboarding hint is done (an alcove's take counts too).
      useUIStore.getState().markSeen('stop');
      onTaken();
    } else {
      playSound('combineFail');
      setMessage(res.reason ?? 'Cannot take it');
    }
  };
  return (
    <div
      role="group"
      aria-label={STOP_TEXT[kind].name}
      className="k-plate k-scroll flex min-h-0 flex-1 flex-col gap-4 p-6"
      onKeyDown={(e) => {
        // A scope open inside (the rune picker) is the top one: the prompt runtime presses its Back.
        if (e.key !== 'Escape' || e.currentTarget.querySelector('[data-pad-scope]')) return;
        e.stopPropagation();
        onClose();
      }}
      data-testid="stop-picker"
      data-pad-scope
    >
      <div className="flex items-center justify-between">
        <span className="k-disp flex items-center gap-3 text-[30px]">
          <Glyph id={STOP_TEXT[kind].glyph} size={28} />
          {STOP_TEXT[kind].name}
        </span>
        <Button
          variant="quiet"
          size="sm"
          binding={{ key: 'Escape', pad: 'b' }}
          onClick={onClose}
          autoFocus
          data-pad-back
        >
          Back
        </Button>
      </div>
      {/* The guided start's `stop.pick`: the picker's body (its root is the pad scope itself). */}
      <div data-tutorial="stop.pick">
        {kind === 'equip' && <EquipPick take={take} />}
        {kind === 'slot' && <SlotPick take={take} dryRun={ops.dry} />}
        {kind === 'move' && <MovePick take={take} dryRun={ops.dry} />}
        {kind === 'upgrade' && <UpgradePick take={take} />}
        {kind === 'rune' && <RunePick take={take} />}
      </div>
      {message && (
        <p className="m-0 text-[18px] text-[var(--k-bad-text)]" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

type Take = (action: StopAction) => void;
type DryRun = StopOps['dry'];

/** What the hero has to pay with. */
function Wallet() {
  const profile = useDelveStore((s) => s.profile);
  return (
    <div className="flex items-center gap-2 text-[16px] text-[var(--k-text-3)]">
      You have <Price links={profile.links} scrap={profile.scrap} dust={profile.manaDust} />
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
  if (profile.bag.length === 0) return <p className="k-body-2 m-0">Your bag is empty.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {profile.bag.map((item) => (
          <ItemTile
            key={item.uid}
            item={item}
            size={64}
            delta={deltas.get(item.uid)}
            onClick={() => take({ kind: 'equip', uid: item.uid })}
            testId="stop-equip-item"
          />
        ))}
      </div>
      {worn && profile.bag.some((i) => i.slot === 'weapon') && (
        <p className="m-0 text-[18px] text-[var(--k-hot)]" data-testid="stop-equip-weapon-note">
          A weapon brings its own moves; yours stay on {worn.name}.
        </p>
      )}
    </div>
  );
}

/** A chain of the equipped weapon to grow by a slot, at its price; one it can't take says why. */
function SlotPick({ take, dryRun }: { take: Take; dryRun: DryRun }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const id = useId();
  const weapon = profile.equipped.weapon;
  if (!weapon) return null;
  const { slots } = movesetOf(registry, weapon);
  return (
    <div className="flex flex-col gap-3">
      {CHAIN_SKILLS.filter((s) => (slots[s] ?? 0) > 0).map((s) => {
        const price = slotPrice(registry, weapon, s);
        // The engine's own op as a dry run: whether it goes through, and why not.
        const dry = dryRun(profile, { kind: 'slot', skill: s });
        const why = !price || dry.ok ? null : dry.reason;
        return (
          <div key={s} className="flex flex-col gap-1">
            <Button
              size="sm"
              className="justify-start"
              disabled={!dry.ok}
              onClick={() => take({ kind: 'slot', skill: s })}
              aria-describedby={why ? `${id}-${s}` : undefined}
              testId={`stop-slot-${s}`}
            >
              {slotsText([[s, slots[s]!, slotRange(registry, weapon, s)[1]]])}
              {price ? (
                <>
                  {' · + a slot · '}
                  <Price links={price.links} scrap={price.scrap} />
                </>
              ) : (
                ' · every slot'
              )}
            </Button>
            {why && (
              <span id={`${id}-${s}`} className="text-[18px] text-[var(--k-hot)]">
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
function MovePick({ take, dryRun }: { take: Take; dryRun: DryRun }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const whyId = useId();
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const [edit, setEdit] = useState<{ skill: ChainSkill; index: number; move: Move | Blow } | null>(
    null,
  );
  // Every construct, dormant ones too: `heroChains` drops them and would offset the pick's index.
  const saved = useMemo(
    () => (weapon ? movesetOf(registry, weapon).chains : {}),
    [registry, weapon],
  );
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
  const dry = edit && changed ? dryRun(profile, { kind: 'move', ...edit }) : null;
  const why = dry && !dry.ok ? dry.reason : null;
  const elements = pairElements(pair);
  return (
    <div className="flex flex-col gap-3">
      <ChainEditor
        chains={chains}
        caps={movesetOf(registry, weapon).slots}
        stats={stats}
        locked={false}
        fixedShape
        absentText={(s) => `No ${SKILL_NAME[s]} slot on this weapon: open it at the Anvil`}
        weaponBaseId={weapon.baseId}
        onChange={(skill, chain) => {
          const now = movesOf(chain);
          const shown = movesOf(chains[skill]);
          const index = now.findIndex((m, i) => !shown[i] || moveKey(m) !== moveKey(shown[i]));
          if (index >= 0) setEdit({ skill, index, move: now[index] });
        }}
        elements={elements.length > 0 ? elements : undefined}
      />
      <Button
        variant="primary"
        disabled={!dry?.ok}
        onClick={() => edit && take({ kind: 'move', ...edit })}
        aria-describedby={why ? whyId : undefined}
        testId="stop-move-take"
      >
        {changed ? (
          <>
            Change {SKILL_NAME[edit!.skill]}&apos;s move {edit!.index + 1}
            {price > 0 && (
              <>
                {' · '}
                <Price dust={price} />
              </>
            )}
          </>
        ) : (
          'Change one move'
        )}
      </Button>
      {why && (
        <span id={whyId} className="text-[18px] text-[var(--k-hot)]">
          {why}
        </span>
      )}
      <Wallet />
    </div>
  );
}

/** The items, worn then in the bag, that an upgrade can take. */
function upgradable(registry: DataRegistry, profile: DelveProfile): GearItem[] {
  return [...GEAR_SLOTS.map((s) => profile.equipped[s]), ...profile.bag].filter(
    (i): i is GearItem => !!i && upgradeCost(registry, i) !== null,
  );
}

/** An item, worn or in the bag, to upgrade once at its price. */
function UpgradePick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const items = upgradable(registry, profile);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {items.map((item) => {
          const cost = upgradeCost(registry, item)!;
          return (
            <div key={item.uid} className="flex flex-col items-center gap-1">
              <ItemTile
                item={item}
                size={64}
                dim={cost > profile.scrap}
                onClick={() => take({ kind: 'upgrade', uid: item.uid })}
                label={`Upgrade ${item.name} for ${cost} scrap`}
                testId="stop-upgrade-item"
              />
              <Price scrap={cost} />
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
  const chains = useMemo(
    () => (equipped.weapon ? movesetOf(registry, equipped.weapon).chains : {}),
    [registry, equipped.weapon],
  );
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
    <div className="flex flex-col gap-3">
      {rows.map(({ skill, index, move, name }) => (
        <div
          key={`${skill}-${index}`}
          role="group"
          aria-label={`${SKILL_NAME[skill]} · ${name}`}
          className="k-well flex items-center justify-between gap-2 p-3 text-[16px]"
          data-testid={`stop-rune-move-${skill}-${index}`}
        >
          <span>
            {SKILL_NAME[skill]} · {name}
          </span>
          <SocketRow
            runes={socketsOf(move)}
            cap={MAX_SOCKETS}
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
