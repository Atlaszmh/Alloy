// Affix type from engine + local extensions
export interface StatEffect {
  stat: string
  op: 'flat' | 'percent' | 'override'
  value: number
}

export interface TierEffects {
  weaponEffect: StatEffect[]
  armorEffect: StatEffect[]
  valueRange: [number, number]
}

export interface Affix {
  id: string
  name: string
  rarity: 'common' | 'rare' | 'unique' | 'exotic'
  tier: 1 | 2 | 3 | 4 | 5
  categories: string[]
  icon: string
  description: string
  weaponFlavorText?: string
  armorFlavorText?: string
  tags: string[]
  tierEffects?: Record<string, TierEffects>
}

/**
 * Component reference inside a recipe — distinguishes raw affix inputs from
 * other recipes (capstones consume previously-combined gems).
 */
export interface RecipeComponentRef {
  kind: 'affix' | 'recipe'
  id: string
}

/**
 * Mirror of the engine's CompoundEffectShape (kept loose here so the tools
 * UI can render new effect kinds without locking to engine type churn).
 * The `kind` discriminator is the source of truth; any other fields are
 * shape-specific.
 */
export interface RecipeCompoundEffectBlueprint {
  condition?: string // TriggerCondition
  effect: { kind: string;[key: string]: unknown }
}

export interface Recipe {
  id: string
  inputs: string[] // legacy — flat list of input ids (lossy: drops kind:'recipe' vs 'affix')
  output: string // affix ID
  depth: 0 | 1 | 2 | 3
  type: 'signature' | 'signature3' | 'category' | 'generic'
  weight: number // 0.5 to 2.0
  notes: string
  // --- Engine-shape fields (additive, optional for backward compat). ---
  /** Structured component references — supersedes `inputs` for new code. */
  components?: RecipeComponentRef[]
  /** Data-driven trigger blueprints (Tier 1-5 trigger system). */
  compoundEffects?: RecipeCompoundEffectBlueprint[]
  /** All output bonus effects (chance, duration params, +%damage on category recipes, etc). */
  outputBonusEffects?: { stat: string; op: 'flat' | 'percent' | 'override'; value: number }[]
  /** Recipe tags as authored in recipes.json. */
  tags?: string[]
}

export interface Synergy {
  id: string
  trigger: string // affix ID
  conditions?: {
    affixesPresent?: string[]
    affixesAbsent?: string[]
    statThresholds?: Array<{ affix: string; stat: string; value: number }>
  }
  effect: {
    type: 'transform' | 'apply' | 'enhance'
    value: string | number
    description: string
  }
  category: 'conditional' | 'transformation' | 'support'
  strength: 'weak' | 'normal' | 'strong'
}

export interface FilterState {
  depths: boolean[] // [ring1, ring2, ring3]
  rarities: Set<Affix['rarity']>
  categories: Set<string>
  searchQuery: string
}

export interface TreeState {
  zoomLevel: number // 1 to 3
  panX: number
  panY: number
  highlightedPath: string[] // node IDs in highlighted path
}

export interface GemBlueprintState {
  affixes: Affix[]
  recipes: Recipe[]
  synergies: Synergy[]
  selectedNode: string | null
  editMode: 'view' | 'create' | 'edit'
  filterState: FilterState
  treeState: TreeState
  isDirty: boolean
}

export interface GemBlueprintActions {
  loadDataFromJSON: () => Promise<void>
  setSelectedNode: (nodeId: string | null) => void
  setEditMode: (mode: GemBlueprintState['editMode']) => void
  updateFilterState: (partial: Partial<FilterState>) => void
  updateTreeState: (partial: Partial<TreeState>) => void
  updateAffix: (id: string, partial: Partial<Affix>) => void
  createRecipe: (inputs: string[], output: string) => void
  deleteRecipe: (id: string) => void
  createSynergy: (synergy: Omit<Synergy, 'id'>) => void
  deleteSynergy: (id: string) => void
  searchByName: (query: string) => void
  resetFilters: () => void
}
