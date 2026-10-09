import type { ReactElement } from 'react';
import { heroChains, legendaryNeeds, type ChainSkill, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { legendaryText } from '../format';
import { SKILL_NAME } from '../chains/chain-text';

/** A legendary power's skill, missing from the weapon (`legendaryNeeds`): "Needs a Defensive". */
const NEEDS_TEXT: Record<ChainSkill, string> = {
  basic: 'Needs a basic chain',
  primary: 'Needs a Primary',
  defensive: 'Needs a Defensive',
  ultimate: 'Needs an Ultimate',
};

/**
 * A legendary's power, and the skill it rides when the equipped weapon plays
 * no chain of it. Nothing for an item with no legendary power.
 */
export function LegendaryBox({ item }: { item: GearItem }): ReactElement | null {
  const registry = getDelveRegistry();
  const pair = useDelveStore((s) => s.profile.pair);
  const equipped = useDelveStore((s) => s.profile.equipped);
  if (!item.legendary) return null;
  const needs = legendaryNeeds(item.legendary.id);
  // The chain as it plays (`heroChains`: a chain of dormant constructs alone is dropped too).
  const dead = !!needs && !heroChains(registry, equipped, pair)[needs];
  return (
    <div
      className="mt-2 rounded-lg px-3 py-2 text-[18px]"
      style={{
        background: 'rgba(251,146,60,0.1)',
        border: '1px solid rgba(251,146,60,0.45)',
        color: '#fed7aa',
      }}
    >
      <div className="k-label text-orange-400">
        ★ {registry.getLegendary(item.legendary.id).name}
      </div>
      {legendaryText(registry, item.legendary.id, item.legendary.value)}
      {dead && needs && (
        <div className="mt-1 text-[18px] font-semibold text-amber-200" data-testid="legendary-dead">
          {NEEDS_TEXT[needs]}: your weapon has no {SKILL_NAME[needs]} chain.
        </div>
      )}
    </div>
  );
}
