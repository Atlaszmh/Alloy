import { useMemo, type ReactElement } from 'react';
import {
  CHAIN_SKILLS,
  MAX_SOCKETS,
  dormantUids,
  movesOf,
  movesetOf,
  profileStats,
  resolveChain,
  slotRange,
  type AbilitySlot,
  type Blow,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { blowText, moveText } from '../chains/chain-text';
import { RARITY_LABEL } from '../format';
import { ItemSockets } from '../runes/ItemSockets';
import { slotsText } from './weapon-frame';

/**
 * A weapon's moveset (the constructs spec §3): each skill's slots against its ceiling
 * ("Primary 2 / 3") and the constructs in them, named as the chain builder names them ("medium
 * Wildfire Burst"), a dormant one (its form of the other class) marked; a skill at 0 slots says
 * where it opens, one the rarity never holds says so.
 */
export function MovesetView({ item }: { item: GearItem }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  // Only the moves' names are read: the hero's stats resolve them as well as any.
  const stats = useMemo(() => profileStats(registry, profile), [registry, profile]);
  const { chains, slots } = movesetOf(registry, item);
  const dormant = dormantUids(registry, item);
  return (
    <div
      className="delve-panel mt-3 flex flex-col gap-1 px-3 py-2 text-[16px]"
      data-testid="item-moveset"
    >
      <div className="k-label">Moveset</div>
      {CHAIN_SKILLS.map((s) => {
        const held = slots[s] ?? 0;
        const ceiling = slotRange(registry, item, s)[1];
        const head = slotsText([[s, held, ceiling]]);
        const chain = chains[s];
        if (held === 0 || !chain) {
          const rarity = RARITY_LABEL[item.rarity].toLowerCase();
          return (
            <div key={s} className="text-stone-500" data-testid={`moveset-${s}`}>
              {head} ·{' '}
              {ceiling === 0
                ? `not on ${/^[aeiou]/.test(rarity) ? 'an' : 'a'} ${rarity} weapon`
                : 'open it on the Temper bench'}
            </div>
          );
        }
        const names = Array.isArray(chain)
          ? chain.map((b: Blow) => blowText(registry, b))
          : resolveChain(registry, stats, s as AbilitySlot, chain).moves.map(moveText);
        const moves = movesOf(chain);
        return (
          <div key={s} className="text-stone-300" data-testid={`moveset-${s}`}>
            <b className="text-stone-100">{head}</b>
            {moves.map((m, i) => {
              const sleeps = !!m.uid && dormant.has(m.uid);
              return (
                <span
                  key={m.uid ?? i}
                  data-dormant={sleeps || undefined}
                  className={sleeps ? 'text-stone-500' : undefined}
                >
                  {' · '}
                  {names[i]}
                  {sleeps && ' (dormant)'}
                </span>
              );
            })}
            {moves.length === 0 && ' · empty'}
          </div>
        );
      })}
      <ItemSockets chains={chains} cap={MAX_SOCKETS} />
    </div>
  );
}
