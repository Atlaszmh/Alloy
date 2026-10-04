import { useMemo, type ReactElement } from 'react';
import {
  CHAIN_SKILLS,
  carriedByText,
  carriedSkills,
  movesetOf,
  profileStats,
  resolveChain,
  socketCap,
  type AbilitySlot,
  type Blow,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { SKILL_NAME, blowText, chainText, moveText } from '../chains/chain-text';
import { ItemSockets } from '../runes/ItemSockets';

/**
 * A weapon's moveset: each chain it carries with its slots ("Primary 2/5") and
 * moves, named as the chain builder names them ("medium Wildfire Burst").
 */
export function MovesetView({ item }: { item: GearItem }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  // Only the moves' names are read: the hero's stats resolve them as well as any.
  const stats = useMemo(() => profileStats(registry, profile), [registry, profile]);
  const { chains, slots } = movesetOf(registry, item);
  const cap = registry.getDelveBalance().chains.cap;
  const carried = carriedSkills(registry, item);
  return (
    <div
      className="delve-panel mt-3 flex flex-col gap-1 px-3 py-2 text-[14px]"
      data-testid="item-moveset"
    >
      <div className="k-label">Moveset</div>
      {CHAIN_SKILLS.map((s) => {
        const chain = chains[s];
        if (!carried.includes(s) || !chain)
          return (
            <div key={s} className="text-stone-500" data-testid={`moveset-${s}`}>
              {SKILL_NAME[s]}: {carriedByText(registry, s).toLowerCase()}
            </div>
          );
        const names = Array.isArray(chain)
          ? chain.map((b: Blow) => blowText(registry, b))
          : resolveChain(registry, stats, s as AbilitySlot, chain).moves.map(moveText);
        return (
          <div key={s} className="text-stone-300" data-testid={`moveset-${s}`}>
            <b className="text-stone-100">
              {SKILL_NAME[s]} {slots[s]}/{cap[s]}
            </b>{' '}
            · {chainText(names)}
          </div>
        );
      })}
      <ItemSockets chains={chains} cap={socketCap(registry, item.rarity)} />
    </div>
  );
}
