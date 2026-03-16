import type { AffixDef, AffixTag } from '../types/affix.js';
import type { BalanceConfig } from '../types/balance.js';
import type { CompoundAffixDef } from '../types/combination.js';
import type { BaseItemDef } from '../types/item.js';
import type { SynergyDef } from '../types/synergy.js';

function combinationKey(id1: string, id2: string): string {
  return [id1, id2].sort().join('+');
}

export class DataRegistry {
  private affixMap: Map<string, AffixDef>;
  private affixByTag: Map<AffixTag, AffixDef[]>;
  private combinationMap: Map<string, CompoundAffixDef>;
  private combinationById: Map<string, CompoundAffixDef>;
  private synergyMap: Map<string, SynergyDef>;
  private baseItemMap: Map<string, BaseItemDef>;
  private baseItemsByType: Map<string, BaseItemDef[]>;

  constructor(
    private readonly affixes: AffixDef[],
    private readonly combinations: CompoundAffixDef[],
    private readonly synergies: SynergyDef[],
    baseItems: BaseItemDef[],
    private readonly balanceConfig: BalanceConfig,
  ) {
    // Build affix maps
    this.affixMap = new Map(affixes.map((a) => [a.id, a]));

    this.affixByTag = new Map();
    for (const affix of affixes) {
      for (const tag of affix.tags) {
        const existing = this.affixByTag.get(tag) ?? [];
        existing.push(affix);
        this.affixByTag.set(tag, existing);
      }
    }

    // Build combination maps (order-independent key)
    this.combinationMap = new Map();
    this.combinationById = new Map();
    for (const combo of combinations) {
      const key = combinationKey(combo.components[0], combo.components[1]);
      this.combinationMap.set(key, combo);
      this.combinationById.set(combo.id, combo);
    }

    // Build synergy map
    this.synergyMap = new Map(synergies.map((s) => [s.id, s]));

    // Build base item maps
    this.baseItemMap = new Map(baseItems.map((b) => [b.id, b]));
    this.baseItemsByType = new Map();
    for (const item of baseItems) {
      const existing = this.baseItemsByType.get(item.type) ?? [];
      existing.push(item);
      this.baseItemsByType.set(item.type, existing);
    }
  }

  // --- Affix Lookups ---

  getAffix(id: string): AffixDef {
    const affix = this.affixMap.get(id);
    if (!affix) throw new Error(`Affix not found: ${id}`);
    return affix;
  }

  findAffix(id: string): AffixDef | undefined {
    return this.affixMap.get(id);
  }

  getAllAffixes(): AffixDef[] {
    return this.affixes;
  }

  getAffixesByTag(tag: AffixTag): AffixDef[] {
    return this.affixByTag.get(tag) ?? [];
  }

  getAffixesByCategory(category: AffixDef['category']): AffixDef[] {
    return this.affixes.filter((a) => a.category === category);
  }

  // --- Combination Lookups ---

  getCombination(affixId1: string, affixId2: string): CompoundAffixDef | null {
    const key = combinationKey(affixId1, affixId2);
    return this.combinationMap.get(key) ?? null;
  }

  getCombinationById(id: string): CompoundAffixDef | null {
    return this.combinationById.get(id) ?? null;
  }

  getAllCombinations(): CompoundAffixDef[] {
    return this.combinations;
  }

  // --- Synergy Lookups ---

  getSynergy(id: string): SynergyDef {
    const synergy = this.synergyMap.get(id);
    if (!synergy) throw new Error(`Synergy not found: ${id}`);
    return synergy;
  }

  getAllSynergies(): SynergyDef[] {
    return this.synergies;
  }

  // --- Base Item Lookups ---

  getBaseItem(id: string): BaseItemDef {
    const item = this.baseItemMap.get(id);
    if (!item) throw new Error(`Base item not found: ${id}`);
    return item;
  }

  getBaseItemsByType(type: 'weapon' | 'armor'): BaseItemDef[] {
    return this.baseItemsByType.get(type) ?? [];
  }

  // --- Balance ---

  getBalance(): BalanceConfig {
    return this.balanceConfig;
  }
}
