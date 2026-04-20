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

export interface Recipe {
  id: string
  inputs: string[] // affix IDs (2 per recipe)
  output: string // affix ID
  depth: 0 | 1 | 2 | 3
  type: 'signature' | 'signature3' | 'category' | 'generic'
  weight: number // 0.5 to 2.0
  notes: string
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
