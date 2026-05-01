import type { StatModifier } from '../types/affix.js';
import type { CompoundEffectBlueprint } from '../types/combat.js';

// --- Recipe Types ---

export interface RecipeComponent {
  kind: 'affix' | 'recipe';
  id: string;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  type: 'signature' | 'signature3' | 'category';
  components?: [RecipeComponent, RecipeComponent] | [RecipeComponent, RecipeComponent, RecipeComponent];
  categoryRule?: { inputA: string; inputB: string };
  outputAffixId: string;
  outputBonusEffects: StatModifier[];
  /**
   * Data-driven trigger effects for compound gems. Each blueprint becomes its
   * own TriggerDef at extraction time. Optional — recipes without this field
   * produce no triggers (e.g. category recipes, capstones with no runtime
   * behavior wired yet).
   */
  compoundEffects?: CompoundEffectBlueprint[];
  maxDepthContribution: number;
  tags: string[];
}

// --- RecipeRegistry ---

function signatureKey(a: string, b: string): string {
  return [a, b].sort().join('+');
}

function ternaryKey(a: string, b: string, c: string): string {
  return [a, b, c].sort().join('+');
}

export class RecipeRegistry {
  private byId: Map<string, RecipeDefinition>;
  private signatureMap: Map<string, RecipeDefinition>;
  private ternaryMap: Map<string, RecipeDefinition>;
  private categoryRecipes: RecipeDefinition[];
  private all: RecipeDefinition[];

  constructor(recipes: RecipeDefinition[]) {
    this.all = recipes;
    this.byId = new Map(recipes.map((r) => [r.id, r]));

    // Build signature lookup: key by sorted component identifiers
    this.signatureMap = new Map();
    for (const recipe of recipes) {
      if (recipe.type === 'signature' && recipe.components) {
        const keyA = `${recipe.components[0].kind}:${recipe.components[0].id}`;
        const keyB = `${recipe.components[1].kind}:${recipe.components[1].id}`;
        this.signatureMap.set(signatureKey(keyA, keyB), recipe);
      }
    }

    // Build ternary lookup: key by sorted triple of component identifiers
    this.ternaryMap = new Map();
    for (const recipe of recipes) {
      if (recipe.type === 'signature3' && recipe.components && recipe.components.length === 3) {
        const [c1, c2, c3] = recipe.components;
        const keyA = `${c1.kind}:${c1.id}`;
        const keyB = `${c2.kind}:${c2.id}`;
        const keyC = `${c3.kind}:${c3.id}`;
        this.ternaryMap.set(ternaryKey(keyA, keyB, keyC), recipe);
      }
    }

    // Collect category recipes
    this.categoryRecipes = recipes.filter((r) => r.type === 'category');
  }

  /**
   * Find a signature recipe matching two gems.
   * For each gem, we check both:
   *   - kind:'affix' match on gem.affixId
   *   - kind:'recipe' match on gem.sourceRecipe
   */
  findSignatureRecipe(
    gemA: { affixId: string; sourceRecipe?: string },
    gemB: { affixId: string; sourceRecipe?: string },
  ): RecipeDefinition | null {
    // Build all possible identifiers for each gem
    const idsA = [`affix:${gemA.affixId}`];
    if (gemA.sourceRecipe) idsA.push(`recipe:${gemA.sourceRecipe}`);

    const idsB = [`affix:${gemB.affixId}`];
    if (gemB.sourceRecipe) idsB.push(`recipe:${gemB.sourceRecipe}`);

    // Check all combinations
    for (const idA of idsA) {
      for (const idB of idsB) {
        const key = signatureKey(idA, idB);
        const match = this.signatureMap.get(key);
        if (match) return match;
      }
    }

    return null;
  }

  /**
   * Find a signature3 recipe matching three gems.
   * For each gem, we check both:
   *   - kind:'affix' match on gem.affixId
   *   - kind:'recipe' match on gem.sourceRecipe
   */
  findTernaryRecipe(
    gemA: { affixId: string; sourceRecipe?: string },
    gemB: { affixId: string; sourceRecipe?: string },
    gemC: { affixId: string; sourceRecipe?: string },
  ): RecipeDefinition | null {
    const idsFor = (g: { affixId: string; sourceRecipe?: string }) => {
      const ids = [`affix:${g.affixId}`];
      if (g.sourceRecipe) ids.push(`recipe:${g.sourceRecipe}`);
      return ids;
    };
    const idsA = idsFor(gemA);
    const idsB = idsFor(gemB);
    const idsC = idsFor(gemC);

    for (const a of idsA) for (const b of idsB) for (const c of idsC) {
      const hit = this.ternaryMap.get(ternaryKey(a, b, c));
      if (hit) return hit;
    }
    return null;
  }

  /**
   * Find a category recipe matching two affix categories.
   * Supports "any" wildcard — e.g. categoryRule { inputA: "sustain", inputB: "any" }
   * matches (sustain, anything) in either order.
   */
  findCategoryRecipe(catA: string, catB: string): RecipeDefinition | null {
    for (const recipe of this.categoryRecipes) {
      if (!recipe.categoryRule) continue;
      const { inputA, inputB } = recipe.categoryRule;

      if (this.categoryMatches(inputA, inputB, catA, catB)) {
        return recipe;
      }
    }
    return null;
  }

  private categoryMatches(
    ruleA: string,
    ruleB: string,
    catA: string,
    catB: string,
  ): boolean {
    // Try both orderings of the actual categories against the rule
    return (
      (this.catMatch(ruleA, catA) && this.catMatch(ruleB, catB)) ||
      (this.catMatch(ruleA, catB) && this.catMatch(ruleB, catA))
    );
  }

  private catMatch(rule: string, actual: string): boolean {
    return rule === 'any' || rule === actual;
  }

  get(id: string): RecipeDefinition | undefined {
    return this.byId.get(id);
  }

  getAll(): RecipeDefinition[] {
    return this.all;
  }
}
