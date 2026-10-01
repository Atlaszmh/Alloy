import type { ReactElement } from 'react';
import { carriedSkills, legendaryNeeds, type ChainSkill, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { legendaryText } from '../format';

/** A legendary power's skill, missing from the weapon (`legendaryNeeds`): "Needs a Defensive". */
const NEEDS_TEXT: Record<ChainSkill, string> = {
  basic: 'Needs a basic chain',
  primary: 'Needs a Primary',
  defensive: 'Needs a Defensive',
  ultimate: 'Needs an Ultimate',
};

/**
 * A legendary's power, and the skill it rides when the equipped weapon doesn't
 * carry it. Nothing for an item with no legendary power.
 */
export function LegendaryBox({ item }: { item: GearItem }): ReactElement | null {
  const registry = getDelveRegistry();
  const weapon = useDelveStore((s) => s.profile.equipped.weapon);
  if (!item.legendary) return null;
  const needs = legendaryNeeds(item.legendary.id);
  const dead = !!needs && !carriedSkills(registry, weapon?.rarity ?? null).includes(needs);
  return (
    <div
      className="mt-2 rounded-lg px-3 py-2 text-sm"
      style={{
        background: 'rgba(251,146,60,0.1)',
        border: '1px solid rgba(251,146,60,0.45)',
        color: '#fed7aa',
      }}
    >
      <div className="delve-display text-xs font-bold uppercase tracking-widest text-orange-400">
        ★ {registry.getLegendary(item.legendary.id).name}
      </div>
      {legendaryText(registry, item.legendary.id, item.legendary.value)}
      {dead && needs && (
        <div className="mt-1 text-xs font-semibold text-amber-200" data-testid="legendary-dead">
          {NEEDS_TEXT[needs]}: your weapon doesn't carry one.
        </div>
      )}
    </div>
  );
}
