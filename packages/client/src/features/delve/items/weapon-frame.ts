import {
  CHAIN_SKILLS,
  movesetOf,
  slotRange,
  weaponClass,
  type ChainSkill,
  type DataRegistry,
  type GearItem,
  type WeaponClass,
} from '@alloy/engine';
import { SKILL_NAME } from '../chains/chain-text';

/** A skill, the slots a weapon holds of it, and its ceiling. */
export type SlotPair = [skill: ChainSkill, held: number, ceiling: number];

/** "Melee", "Ranged"; "Unarmed" for no weapon. */
export function classText(cls: WeaponClass | null): string {
  return cls === 'melee' ? 'Melee' : cls === 'ranged' ? 'Ranged' : 'Unarmed';
}

/** "Melee · Balanced": a weapon's class and the name of its cast style (spec §4.1). */
export function frameText(registry: DataRegistry, item: Pick<GearItem, 'baseId'>): string {
  const base = registry.getGearBase(item.baseId);
  const cls = classText(weaponClass(registry, item.baseId));
  return base.style ? `${cls} · ${base.style.name}` : cls;
}

/** Each skill's slots held of its ceiling, in `CHAIN_SKILLS` order (spec §3.2). */
export function slotPairs(registry: DataRegistry, item: GearItem): SlotPair[] {
  const { slots } = movesetOf(registry, item);
  return CHAIN_SKILLS.map((s) => [s, slots[s] ?? 0, slotRange(registry, item, s)[1]]);
}

/** "Basic 3 / 3 · Primary 2 / 3 · Defensive 0 / 1 · Ultimate —" (a 0 ceiling reads —). */
export function slotsText(pairs: readonly SlotPair[]): string {
  return pairs
    .map(([s, held, ceiling]) =>
      ceiling === 0 ? `${SKILL_NAME[s]} —` : `${SKILL_NAME[s]} ${held} / ${ceiling}`,
    )
    .join(' · ');
}
